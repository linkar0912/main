import type { CommentTrigger, EvaluationContext, FlowCondition, FlowDefinitionV1, MessageTrigger, NormalizedEvent } from "./types";

/** Instagram caps a comment at 2,200 characters; text past that is never matched. */
export const MAX_MATCH_TEXT_LENGTH = 2_200;
/** Longest regex keyword the engine runs. Longer patterns never match (and cannot be saved). */
export const MAX_REGEX_KEYWORD_LENGTH = 100;
/** Compiled keyword matchers kept between events. */
export const KEYWORD_MATCHER_CACHE_SIZE = 2_000;
/** Longer (legacy) keywords are compiled per use so one oversized keyword cannot pin cache memory. */
const MAX_CACHED_KEYWORD_LENGTH = 256;

type KeywordMode = NonNullable<CommentTrigger["mode"]>;

/** Trim, lowercase, and strip diacritics so café matches cafe across locales. */
function normalizedText(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Linear-time regex engine
//
// Tenant regex keywords run on the singleton worker's event loop, so a
// backtracking engine lets one pattern such as `(a|a)+$` stall every
// workspace. This is a small Thompson-NFA matcher: it advances every
// alternative in lock step, so one test costs at most (text length x program
// size) steps whatever the pattern. It covers the everyday subset of
// JavaScript regex syntax (literals, escapes, classes, groups, alternation,
// greedy or lazy quantifiers, ^, $, \b, \B) and always ignores case, like the
// `i` flag the matcher used before. Lookarounds, backreferences, \p{...} and
// anything else it does not know fail to compile, and a pattern that does not
// compile never matches.
//
// Every regex check for one event spends from a single work budget shared by
// all the automations checked against that event (see regexStateFor), so the
// worker's cost per event stays bounded however many patterns a workspace has.
// ---------------------------------------------------------------------------

/** Program size and repeat count limits keep the per-character work small. */
const MAX_REGEX_PROGRAM_SIZE = 250;
const MAX_REGEX_REPEAT = 1_000;
/**
 * Regex work one event may cost, shared by every automation checked against
 * it. A unit is one engine operation: a text position, a character test (a
 * few more for a non-ASCII character, which takes a binary search), an
 * instruction visited while following moves that consume no text, or a
 * compile step. Everyday patterns use about three units per character, so a
 * few hundred of them fit even on a 2,200-character comment (thousands on a
 * typical DM). Once the budget runs out the event's remaining regex keywords
 * count as no match, which keeps the worst case to a few tens of milliseconds
 * of worker time per event.
 */
export const MAX_REGEX_STEPS_PER_EVENT = 2_000_000;
/** Fixed charge per regex keyword check, so thousands of cheap patterns are bounded too. */
const REGEX_CHECK_COST = 200;

/** Remaining regex work for one event, shared by its regex keywords. */
export type RegexBudget = { steps: number };

const MAX_CODE_UNIT = 0xffff;

/**
 * A character class compiled with case folding already applied: an ASCII
 * character is one bitmap lookup and any other a binary search over sorted
 * ranges.
 */
type CharSet = {
  /** One bit per ASCII character, with negation applied. */
  ascii: Uint32Array;
  /** Sorted, disjoint, inclusive [start, end] pairs, before negation. */
  ranges: Uint16Array;
  negate: boolean;
  /** Work units charged for testing one non-ASCII character. */
  cost: number;
};
type Assertion = "start" | "end" | "word" | "not-word";
type RegexNode =
  | { kind: "char"; set: CharSet }
  | { kind: "assert"; assertion: Assertion }
  | { kind: "concat"; items: RegexNode[] }
  | { kind: "alt"; options: RegexNode[] }
  | { kind: "repeat"; item: RegexNode; min: number; max: number };
type CharInstruction = { op: "char"; set: CharSet };
type SplitInstruction = { op: "split"; x: number; y: number };
type JumpInstruction = { op: "jump"; to: number };
type Instruction =
  | CharInstruction
  | SplitInstruction
  | JumpInstruction
  | { op: "assert"; assertion: Assertion }
  | { op: "match" };
type CompiledRegex = { program: Instruction[]; anchored: boolean };
/** Work spent compiling one pattern. */
type CompileWork = { units: number };

class RegexSyntaxError extends Error {}

const DIGIT_RANGES = [48, 57];
const WORD_RANGES = [48, 57, 65, 90, 95, 95, 97, 122];
const SPACE_RANGES = [
  9, 13, 32, 32, 0xa0, 0xa0, 0x1680, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029,
  0x202f, 0x202f, 0x205f, 0x205f, 0x3000, 0x3000, 0xfeff, 0xfeff,
];
const LINE_TERMINATOR_RANGES = [10, 10, 13, 13, 0x2028, 0x2029];

const isDigitCode = (code: number) => code >= 48 && code <= 57;
const isWordChar = (code: number) =>
  isDigitCode(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;

/** JavaScript's non-Unicode case folding: upper-case, but never map a non-ASCII char onto ASCII. */
function canonicalCode(code: number): number {
  if (code < 128) return code >= 97 && code <= 122 ? code - 32 : code;
  const upper = String.fromCharCode(code).toUpperCase();
  return upper.length === 1 && upper.charCodeAt(0) >= 128 ? upper.charCodeAt(0) : code;
}

type CaseFolding = {
  /** Links the characters that share a canonical character into a ring. */
  nextInOrbit: Uint16Array;
  /** Sorted characters that share their canonical character with another. */
  foldable: Uint16Array;
};
let caseFoldingTables: CaseFolding | undefined;

/**
 * With the `i` flag JavaScript treats two characters as equal when they share
 * a canonical character, and a few (Σ σ ς, or Ι ι ͅ ι) come in groups of three
 * or four. The groups are built once, on first use, in a few milliseconds.
 */
function caseFolding(): CaseFolding {
  if (caseFoldingTables) return caseFoldingTables;
  const size = MAX_CODE_UNIT + 1;
  const nextInOrbit = new Uint16Array(size);
  const first = new Int32Array(size).fill(-1);
  const last = new Int32Array(size);
  for (let code = 0; code < size; code += 1) {
    const canonical = canonicalCode(code);
    if (first[canonical] < 0) {
      first[canonical] = code;
      nextInOrbit[code] = code;
    } else {
      nextInOrbit[last[canonical]] = code;
      nextInOrbit[code] = first[canonical];
    }
    last[canonical] = code;
  }
  const foldable: number[] = [];
  for (let code = 0; code < size; code += 1) {
    if (nextInOrbit[code] !== code) foldable.push(code);
  }
  caseFoldingTables = { nextInOrbit, foldable: Uint16Array.from(foldable) };
  return caseFoldingTables;
}

/** Sorts and merges flat [start, end, start, end, ...] pairs. */
function mergeRanges(pairs: number[]): number[] {
  const order: Array<[number, number]> = [];
  for (let index = 0; index < pairs.length; index += 2) order.push([pairs[index], pairs[index + 1]]);
  order.sort((left, right) => left[0] - right[0]);
  const merged: number[] = [];
  for (const [start, end] of order) {
    const lastEnd = merged.length - 1;
    if (merged.length > 0 && start <= merged[lastEnd] + 1) {
      if (end > merged[lastEnd]) merged[lastEnd] = end;
    } else {
      merged.push(start, end);
    }
  }
  return merged;
}

/** The complement of sorted, merged pairs within the code unit range. */
function complementRanges(ranges: number[]): number[] {
  const complement: number[] = [];
  let next = 0;
  for (let index = 0; index < ranges.length; index += 2) {
    if (ranges[index] > next) complement.push(next, ranges[index] - 1);
    next = ranges[index + 1] + 1;
  }
  if (next <= MAX_CODE_UNIT) complement.push(next, MAX_CODE_UNIT);
  return complement;
}

function rangesContain(ranges: ArrayLike<number>, code: number): boolean {
  let low = 0;
  let high = ranges.length / 2 - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (code < ranges[middle * 2]) high = middle - 1;
    else if (code > ranges[middle * 2 + 1]) low = middle + 1;
    else return true;
  }
  return false;
}

/** Index of the first value in sorted `values` that is >= `target`. */
function lowerBound(values: Uint16Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function buildCharSet(pairs: number[], negate: boolean, work: CompileWork): CharSet {
  let ranges = mergeRanges(pairs);
  work.units += pairs.length;
  // Ignore case: add every character that shares a canonical character with
  // a member, so matching needs one lookup instead of one per case variant.
  const { nextInOrbit, foldable } = caseFolding();
  const partners: number[] = [];
  for (let index = 0; index < ranges.length; index += 2) {
    const end = ranges[index + 1];
    for (let at = lowerBound(foldable, ranges[index]); at < foldable.length && foldable[at] <= end; at += 1) {
      const member = foldable[at];
      for (let partner = nextInOrbit[member]; partner !== member; partner = nextInOrbit[partner]) {
        work.units += 1;
        if (!rangesContain(ranges, partner)) partners.push(partner, partner);
      }
    }
  }
  if (partners.length > 0) ranges = mergeRanges(ranges.concat(partners));
  const ascii = new Uint32Array(4);
  for (let code = 0; code < 128; code += 1) {
    if (rangesContain(ranges, code) !== negate) ascii[code >> 5] |= 1 << (code & 31);
  }
  work.units += 16;
  const rangeCount = ranges.length / 2;
  return { ascii, ranges: Uint16Array.from(ranges), negate, cost: 1 + Math.ceil(Math.log2(rangeCount + 1)) };
}

/** \d, \w, \s and their negations, as code unit ranges. */
function escapeRanges(char: string): number[] | null {
  switch (char) {
    case "d": return DIGIT_RANGES;
    case "D": return complementRanges(DIGIT_RANGES);
    case "w": return WORD_RANGES;
    case "W": return complementRanges(WORD_RANGES);
    case "s": return SPACE_RANGES;
    case "S": return complementRanges(SPACE_RANGES);
    default: return null;
  }
}

/** The fixed sets (`.`, \d, \w, \s and negations) are built once and shared by every pattern. */
const sharedSets = new Map<string, CharSet>();
function sharedSet(name: string, ranges: number[], negate: boolean): CharSet {
  let set = sharedSets.get(name);
  if (!set) {
    set = buildCharSet(ranges, negate, { units: 0 });
    sharedSets.set(name, set);
  }
  return set;
}

/** Whether a node can only ever match the empty string (assertions and empty groups). */
function isZeroWidth(node: RegexNode): boolean {
  switch (node.kind) {
    case "char": return false;
    case "assert": return true;
    case "concat": return node.items.every(isZeroWidth);
    case "alt": return node.options.every(isZeroWidth);
    case "repeat": return isZeroWidth(node.item);
  }
}

function parseRegex(pattern: string, work: CompileWork): { node: RegexNode; anchored: boolean } {
  let index = 0;
  const literals = new Map<number, CharSet>();

  const literal = (code: number): RegexNode => {
    let set = literals.get(code);
    if (!set) {
      set = buildCharSet([code, code], false, work);
      literals.set(code, set);
    }
    return { kind: "char", set };
  };

  function readBraces(): { min: number; max: number } | null {
    const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(index));
    if (!match) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === "" ? Infinity : Number(match[3]);
    if (min > MAX_REGEX_REPEAT || (max !== Infinity && max > MAX_REGEX_REPEAT)) {
      throw new RegexSyntaxError("Repeat count too large");
    }
    if (max < min) throw new RegexSyntaxError("Numbers out of order in {} quantifier");
    index += match[0].length;
    return { min, max };
  }

  function parseQuantifier(): { min: number; max: number } | null {
    const char = pattern[index];
    let bounds: { min: number; max: number } | null = null;
    if (char === "*") bounds = { min: 0, max: Infinity };
    else if (char === "+") bounds = { min: 1, max: Infinity };
    else if (char === "?") bounds = { min: 0, max: 1 };
    if (bounds) index += 1;
    else if (char === "{") bounds = readBraces();
    // A lazy quantifier changes which text matches, never whether any does.
    if (bounds && pattern[index] === "?") index += 1;
    return bounds;
  }

  /** Single-character escapes shared by classes and plain atoms (index is past the escaped char). */
  function escapedCode(char: string): number {
    switch (char) {
      case "n": return 10;
      case "r": return 13;
      case "t": return 9;
      case "v": return 11;
      case "f": return 12;
      case "0":
        if (isDigitCode(pattern.charCodeAt(index))) throw new RegexSyntaxError("Octal escapes are not supported");
        return 0;
      case "x":
      case "u": {
        // Without enough hex digits JavaScript reads \x and \u as plain letters.
        const hex = (char === "x" ? /^[0-9a-fA-F]{2}/ : /^[0-9a-fA-F]{4}/).exec(pattern.slice(index));
        if (!hex) return char.charCodeAt(0);
        index += hex[0].length;
        return Number.parseInt(hex[0], 16);
      }
      case "c":
      case "k":
      case "p":
      case "P":
        throw new RegexSyntaxError(`\\${char} is not supported`);
      default:
        if (char >= "1" && char <= "9") throw new RegexSyntaxError("Backreferences are not supported");
        return char.charCodeAt(0);
    }
  }

  /** One class member: a code unit, or the ranges of a class escape such as \d. */
  function readClassAtom(): number | number[] {
    const char = pattern[index++];
    if (char !== "\\") return char.charCodeAt(0);
    if (index >= pattern.length) throw new RegexSyntaxError("\\ at end of pattern");
    const escaped = pattern[index++];
    if (escaped === "b") return 8;
    return escapeRanges(escaped) ?? escapedCode(escaped);
  }

  function parseClass(): RegexNode {
    index += 1;
    let negate = false;
    if (pattern[index] === "^") {
      negate = true;
      index += 1;
    }
    const pairs: number[] = [];
    const add = (atom: number | number[]) => {
      if (typeof atom === "number") pairs.push(atom, atom);
      else pairs.push(...atom);
    };
    while (pattern[index] !== "]") {
      if (index >= pattern.length) throw new RegexSyntaxError("Unterminated character class");
      const start = readClassAtom();
      if (pattern[index] === "-" && index + 1 < pattern.length && pattern[index + 1] !== "]") {
        index += 1;
        const end = readClassAtom();
        if (typeof start === "number" && typeof end === "number") {
          if (start > end) throw new RegexSyntaxError("Range out of order in character class");
          pairs.push(start, end);
        } else {
          // As in JavaScript, a class escape on either side makes the dash literal.
          add(start);
          add(45);
          add(end);
        }
      } else {
        add(start);
      }
    }
    index += 1;
    return { kind: "char", set: buildCharSet(pairs, negate, work) };
  }

  function parseGroup(): RegexNode {
    index += 1;
    if (pattern[index] === "?") {
      if (pattern[index + 1] === ":") {
        index += 2;
      } else if (pattern[index + 1] === "<" && /^<[A-Za-z_$][\w$]*>/.test(pattern.slice(index + 1))) {
        index = pattern.indexOf(">", index) + 1;
      } else {
        throw new RegexSyntaxError("Lookarounds and inline flags are not supported");
      }
    }
    const inner = parseAlternation();
    if (pattern[index] !== ")") throw new RegexSyntaxError("Unterminated group");
    index += 1;
    return inner;
  }

  function parseAtom(): RegexNode {
    const char = pattern[index];
    if (char === "(") return parseGroup();
    if (char === "[") return parseClass();
    if (char === "{") {
      if (readBraces()) throw new RegexSyntaxError("Nothing to repeat");
      index += 1;
      return literal(123);
    }
    index += 1;
    switch (char) {
      case ".": return { kind: "char", set: sharedSet(".", LINE_TERMINATOR_RANGES, true) };
      case "^": return { kind: "assert", assertion: "start" };
      case "$": return { kind: "assert", assertion: "end" };
      case "*":
      case "+":
      case "?":
        throw new RegexSyntaxError("Nothing to repeat");
      case "\\": {
        if (index >= pattern.length) throw new RegexSyntaxError("\\ at end of pattern");
        const escaped = pattern[index++];
        if (escaped === "b") return { kind: "assert", assertion: "word" };
        if (escaped === "B") return { kind: "assert", assertion: "not-word" };
        const ranges = escapeRanges(escaped);
        if (ranges) return { kind: "char", set: sharedSet(`\\${escaped}`, ranges, false) };
        return literal(escapedCode(escaped));
      }
      default:
        return literal(char.charCodeAt(0));
    }
  }

  function parseSequence(): RegexNode {
    const items: RegexNode[] = [];
    while (index < pattern.length && pattern[index] !== "|" && pattern[index] !== ")") {
      const atomStart = index;
      const atom = parseAtom();
      const bounds = parseQuantifier();
      if (!bounds) {
        items.push(atom);
        continue;
      }
      // JavaScript rejects a quantifier right after ^, $, \b or \B, but a
      // group that holds only assertions may be repeated.
      if (atom.kind === "assert" && pattern[atomStart] !== "(") throw new RegexSyntaxError("Nothing to repeat");
      if (isZeroWidth(atom)) {
        // Repeating something that consumes no text changes nothing: it is
        // checked once when required and can always be skipped when optional.
        if (bounds.min > 0) items.push(atom);
        continue;
      }
      items.push({ kind: "repeat", item: atom, ...bounds });
    }
    return items.length === 1 ? items[0] : { kind: "concat", items };
  }

  function parseAlternation(): RegexNode {
    const options = [parseSequence()];
    while (pattern[index] === "|") {
      index += 1;
      options.push(parseSequence());
    }
    return options.length === 1 ? options[0] : { kind: "alt", options };
  }

  const node = parseAlternation();
  if (index < pattern.length) throw new RegexSyntaxError("Unmatched ')'");
  const first = node.kind === "concat" ? node.items[0] : node;
  return { node, anchored: first?.kind === "assert" && first.assertion === "start" };
}

function compileProgram(root: RegexNode): Instruction[] {
  const program: Instruction[] = [];
  const emit = <T extends Instruction>(instruction: T): T => {
    if (program.length >= MAX_REGEX_PROGRAM_SIZE) throw new RegexSyntaxError("Pattern is too large");
    program.push(instruction);
    return instruction;
  };

  const visit = (node: RegexNode): void => {
    switch (node.kind) {
      case "char":
        emit({ op: "char", set: node.set });
        return;
      case "assert":
        emit({ op: "assert", assertion: node.assertion });
        return;
      case "concat":
        node.items.forEach(visit);
        return;
      case "alt": {
        const exits: JumpInstruction[] = [];
        node.options.forEach((option, position) => {
          if (position === node.options.length - 1) {
            visit(option);
            return;
          }
          const split = emit<SplitInstruction>({ op: "split", x: program.length + 1, y: 0 });
          visit(option);
          exits.push(emit<JumpInstruction>({ op: "jump", to: 0 }));
          split.y = program.length;
        });
        for (const exit of exits) exit.to = program.length;
        return;
      }
      case "repeat": {
        const { item, min, max } = node;
        if (max === Infinity) {
          if (min === 0) {
            const loop = program.length;
            const split = emit<SplitInstruction>({ op: "split", x: loop + 1, y: 0 });
            visit(item);
            emit<JumpInstruction>({ op: "jump", to: loop });
            split.y = program.length;
            return;
          }
          for (let count = 1; count < min; count += 1) visit(item);
          const loop = program.length;
          visit(item);
          emit<SplitInstruction>({ op: "split", x: loop, y: program.length + 1 });
          return;
        }
        for (let count = 0; count < min; count += 1) visit(item);
        for (let count = min; count < max; count += 1) {
          const split = emit<SplitInstruction>({ op: "split", x: program.length + 1, y: 0 });
          visit(item);
          split.y = program.length;
        }
        return;
      }
    }
  };

  visit(root);
  emit({ op: "match" });
  return program;
}

/**
 * Runs a compiled pattern over `text`, charging `budget` for every operation:
 * one unit per text position, one per ASCII character test (more for
 * non-ASCII, see CharSet.cost) and one per instruction visited while
 * following moves that consume no text. Reports no match once the budget is
 * spent; the overrun is at most one text position's work.
 */
function runProgram(regex: CompiledRegex, text: string, budget: RegexBudget): boolean {
  if (budget.steps <= 0) return false;
  const { program, anchored } = regex;
  const size = program.length;
  const textLength = text.length;
  const marks = new Int32Array(size).fill(-1);
  const stack = new Int32Array(size * 2 + 1);
  let current = new Int32Array(size);
  let next = new Int32Array(size);
  let currentLength = 0;
  let listLength = 0;
  let generation = 0;
  let work = 0;

  const isWordAt = (position: number) =>
    position >= 0 && position < textLength && isWordChar(text.charCodeAt(position));
  const holds = (assertion: Assertion, position: number): boolean => {
    if (assertion === "start") return position === 0;
    if (assertion === "end") return position === textLength;
    const boundary = isWordAt(position - 1) !== isWordAt(position);
    return assertion === "word" ? boundary : !boundary;
  };

  // Adds every char instruction reachable from `start` without consuming text;
  // returns true as soon as the match instruction is reachable.
  const follow = (list: Int32Array, start: number, position: number): boolean => {
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const pc = stack[--top];
      work += 1;
      if (marks[pc] === generation) continue;
      marks[pc] = generation;
      const instruction = program[pc];
      switch (instruction.op) {
        case "match":
          return true;
        case "jump":
          stack[top++] = instruction.to;
          break;
        case "split":
          stack[top++] = instruction.y;
          stack[top++] = instruction.x;
          break;
        case "assert":
          if (holds(instruction.assertion, position)) stack[top++] = pc + 1;
          break;
        case "char":
          list[listLength++] = pc;
          break;
      }
    }
    return false;
  };

  let matched = follow(current, 0, 0);
  currentLength = listLength;
  for (let position = 0; !matched && position < textLength; position += 1) {
    if (anchored && currentLength === 0) break;
    budget.steps -= work + 1;
    work = 0;
    if (budget.steps < 0) return false;
    const code = text.charCodeAt(position);
    generation += 1;
    listLength = 0;
    for (let item = 0; item < currentLength && !matched; item += 1) {
      const pc = current[item];
      const { set } = program[pc] as CharInstruction;
      let inSet: boolean;
      if (code < 128) {
        inSet = (set.ascii[code >> 5] & (1 << (code & 31))) !== 0;
        work += 1;
      } else {
        inSet = rangesContain(set.ranges, code) !== set.negate;
        work += set.cost;
      }
      if (inSet) matched = follow(next, pc + 1, position + 1);
    }
    if (!matched && !anchored) matched = follow(next, 0, position + 1);
    [current, next] = [next, current];
    currentLength = listLength;
  }
  budget.steps -= work;
  return matched;
}

/** Parses and compiles a pattern, adding the work spent to `work`; null when it cannot run. */
function compileRegex(pattern: string, work: CompileWork): CompiledRegex | null {
  work.units += pattern.length;
  if (pattern.length === 0 || pattern.length > MAX_REGEX_KEYWORD_LENGTH) return null;
  try {
    const { node, anchored } = parseRegex(pattern, work);
    const program = compileProgram(node);
    work.units += program.length;
    return { program, anchored };
  } catch {
    return null;
  }
}

/**
 * Compiles a regex keyword for the linear-time engine. Returns null when the
 * pattern is empty, longer than {@link MAX_REGEX_KEYWORD_LENGTH}, or uses
 * syntax the engine does not support; such a pattern never matches. The test
 * spends from `budget` (a fresh per-event budget when omitted) and reports no
 * match once it is used up.
 */
export function compileRegexKeyword(pattern: string): ((text: string, budget?: RegexBudget) => boolean) | null {
  const regex = compileRegex(pattern, { units: 0 });
  if (!regex) return null;
  return (text, budget = { steps: MAX_REGEX_STEPS_PER_EVENT }) => runProgram(regex, text, budget);
}

// ---------------------------------------------------------------------------
// Keyword matchers
// ---------------------------------------------------------------------------

/**
 * Regex work and results for one event. Every automation checked against the
 * event (including the runner's second pass over story-reply flows) shares
 * the budget, and a pattern already checked reuses its result, so checking a
 * flow twice gives the same answer and costs nothing the second time.
 */
type RegexEventState = { raw: string; budget: RegexBudget; results: Map<string, boolean> };
/** The worker handles a few events at once, so several events keep their state. */
const RECENT_REGEX_EVENTS = 32;
const recentRegexEvents = new Map<string, RegexEventState>();

function regexStateFor(raw: string, eventId: string | undefined): RegexEventState {
  const fresh = (): RegexEventState => ({ raw, budget: { steps: MAX_REGEX_STEPS_PER_EVENT }, results: new Map() });
  if (eventId === undefined) return fresh();
  const known = recentRegexEvents.get(eventId);
  const state = known?.raw === raw ? known : fresh();
  recentRegexEvents.delete(eventId);
  recentRegexEvents.set(eventId, state);
  if (recentRegexEvents.size > RECENT_REGEX_EVENTS) {
    const oldest = recentRegexEvents.keys().next().value;
    if (oldest !== undefined) recentRegexEvents.delete(oldest);
  }
  return state;
}

/** The event text, capped and normalized once, shared by every keyword check. */
type MatchSubject = { raw: string; normalized: string; eventId?: string; regex?: RegexEventState };
type KeywordMatcher = (subject: MatchSubject) => boolean;

const neverMatches: KeywordMatcher = () => false;
let lastNormalized: { raw: string; normalized: string } | undefined;

/** The runner checks every automation against the same event, so the last normalized text is reused. */
function subjectFor(text: string, eventId?: string): MatchSubject {
  const raw = text.length > MAX_MATCH_TEXT_LENGTH ? text.slice(0, MAX_MATCH_TEXT_LENGTH) : text;
  if (lastNormalized?.raw !== raw) lastNormalized = { raw, normalized: normalizedText(raw) };
  return { raw, normalized: lastNormalized.normalized, eventId };
}

function regexState(subject: MatchSubject): RegexEventState {
  subject.regex ??= regexStateFor(subject.raw, subject.eventId);
  return subject.regex;
}

/** `budget` pays for compiling a regex keyword; other modes ignore it. */
function compileKeywordMatcher(mode: KeywordMode, keyword: string, budget: RegexBudget | undefined): KeywordMatcher {
  if (mode === "regex") {
    const work: CompileWork = { units: 0 };
    const regex = compileRegex(keyword, work);
    if (budget) budget.steps -= work.units;
    // Regex runs on the raw (capped) text so patterns keep their meaning.
    return regex ? (subject) => runProgram(regex, subject.raw, regexState(subject).budget) : neverMatches;
  }
  const normalizedKeyword = normalizedText(keyword);
  if (!normalizedKeyword) return neverMatches;
  if (mode === "contains") return (subject) => subject.normalized.includes(normalizedKeyword);
  if (mode === "exact") return (subject) => subject.normalized === normalizedKeyword;

  // "any" and "all": the keyword as a whole phrase, with flexible whitespace.
  const flexiblePhrase = normalizedKeyword
    .split(/\s+/u)
    .map(escapeRegex)
    .join("\\s+");
  const startsWithWordCharacter = /^[\p{L}\p{N}_]/u.test(normalizedKeyword);
  const endsWithWordCharacter = /[\p{L}\p{N}_]$/u.test(normalizedKeyword);
  const pattern = new RegExp([
    startsWithWordCharacter ? "(?<![\\p{L}\\p{N}_])" : "",
    flexiblePhrase,
    endsWithWordCharacter ? "(?![\\p{L}\\p{N}_])" : "",
  ].join(""), "u");
  return (subject) => pattern.test(subject.normalized);
}

const matcherCache = new Map<string, KeywordMatcher>();

/** A compiled matcher from a bounded LRU keyed by mode and (trimmed) keyword. */
function keywordMatcher(mode: KeywordMode, keyword: string, budget?: RegexBudget): KeywordMatcher {
  const cacheMode = mode === "all" ? "any" : mode;
  if (keyword.length > MAX_CACHED_KEYWORD_LENGTH) return compileKeywordMatcher(cacheMode, keyword, budget);
  const key = `${cacheMode}\u0000${keyword}`;
  const cached = matcherCache.get(key);
  if (cached) {
    matcherCache.delete(key);
    matcherCache.set(key, cached);
    return cached;
  }
  const matcher = compileKeywordMatcher(cacheMode, keyword, budget);
  matcherCache.set(key, matcher);
  if (matcherCache.size > KEYWORD_MATCHER_CACHE_SIZE) {
    const oldest = matcherCache.keys().next().value;
    if (oldest !== undefined) matcherCache.delete(oldest);
  }
  return matcher;
}

/** How many compiled matchers are cached right now (never above the cap); for tests and diagnostics. */
export function keywordMatcherCacheSize(): number {
  return matcherCache.size;
}

/** Whether one (trimmed, non-empty) keyword matches; regex results are kept for the rest of the event. */
function keywordMatches(subject: MatchSubject, mode: KeywordMode, keyword: string): boolean {
  if (mode !== "regex") return keywordMatcher(mode, keyword)(subject);
  const state = regexState(subject);
  let matched = state.results.get(keyword);
  if (matched === undefined) {
    state.budget.steps -= REGEX_CHECK_COST;
    matched = state.budget.steps > 0 && keywordMatcher(mode, keyword, state.budget)(subject);
    state.results.set(keyword, matched);
  }
  return matched;
}

/** The first keyword (as written in the list) that matches, ignoring blank entries. */
function firstMatchingKeyword(subject: MatchSubject, keywords: string[], mode: KeywordMode): string | undefined {
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed && keywordMatches(subject, mode, trimmed)) return keyword;
  }
  return undefined;
}

type KeywordMatch = { matched: false } | { matched: true; keyword: string };
const NO_KEYWORD_MATCH: KeywordMatch = { matched: false };

/**
 * Evaluate a trigger's keyword list using the configured match mode. "any"
 * (the default) needs one keyword as a whole phrase, "all" needs every
 * keyword, "exact" matches the whole normalized text, "regex" runs each entry
 * on the linear-time engine, and "contains" is a substring check. Returns the
 * matched keyword (for "all", the first one) for {keyword} personalization.
 */
function matchKeywords(
  subject: MatchSubject,
  keywords: string[],
  mode: KeywordMode | undefined,
): KeywordMatch {
  const effectiveMode = mode ?? "any";
  if (effectiveMode !== "all") {
    const keyword = firstMatchingKeyword(subject, keywords, effectiveMode);
    return keyword === undefined ? NO_KEYWORD_MATCH : { matched: true, keyword };
  }
  let first: string | undefined;
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    if (!keywordMatches(subject, "all", trimmed)) return NO_KEYWORD_MATCH;
    first ??= keyword;
  }
  return first === undefined ? NO_KEYWORD_MATCH : { matched: true, keyword: first };
}

/** True if any negative keyword appears in the text (case- and accent-insensitive substring). */
function matchesNegative(subject: MatchSubject, negativeKeywords: string[] | undefined): boolean {
  if (!negativeKeywords || negativeKeywords.length === 0) return false;
  return firstMatchingKeyword(subject, negativeKeywords, "contains") !== undefined;
}

/** The first keyword that appears in `text` (normalized), for {keyword} personalization. */
export function findMatchedKeyword(
  text: string | undefined,
  keywords: string[],
  mode: CommentTrigger["mode"] = "any",
): string | undefined {
  if (!text) return undefined;
  return firstMatchingKeyword(subjectFor(text), keywords, mode ?? "any");
}

/** Per-media override for the private reply, when the trigger carries a map. */
export function resolveReplyForMedia(
  trigger: CommentTrigger,
  mediaId: string | undefined,
): string | undefined {
  if (!trigger.replyPerMedia || !mediaId) return undefined;
  return trigger.replyPerMedia[mediaId];
}

function matchesConditions(
  conditions: FlowCondition[],
  event: NormalizedEvent,
  subject: () => MatchSubject | undefined,
): boolean {
  return conditions.every((condition) => {
    if (condition.type === "contains_keyword") {
      const text = subject();
      return Boolean(text) && firstMatchingKeyword(text as MatchSubject, condition.keywords, "contains") !== undefined;
    }
    return Boolean(event.mediaId && condition.mediaIds.includes(event.mediaId));
  });
}

/** Inbound DM-side events a person can use to start a conversation with the account. */
const CONVERSATION_EVENT_TYPES: NormalizedEvent["type"][] = [
  "message.received",
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
  "story_mention.received",
];

export type TriggerMatch = { matched: false } | { matched: true; keyword?: string };
const NO_TRIGGER_MATCH: TriggerMatch = { matched: false };

/**
 * Whether `event` fires `flow`, plus the keyword that matched for keyword
 * triggers, so callers do not scan the keyword list a second time.
 */
export function evaluateTrigger(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: EvaluationContext = {},
): TriggerMatch {
  const trigger = flow.trigger;
  let subject: MatchSubject | undefined;
  const textSubject = () => (event.text ? (subject ??= subjectFor(event.text, event.id)) : undefined);
  let keyword: string | undefined;
  const keywordsMatch = (keywords: string[], mode: KeywordMode | undefined): boolean => {
    const text = textSubject();
    const result = text ? matchKeywords(text, keywords, mode) : NO_KEYWORD_MATCH;
    if (result.matched) keyword = result.keyword;
    return result.matched;
  };

  if (trigger.type === "comment") {
    if (event.type !== "comment.created") return NO_TRIGGER_MATCH;
    if (trigger.mediaIds.length > 0 && (!event.mediaId || !trigger.mediaIds.includes(event.mediaId))) {
      return NO_TRIGGER_MATCH;
    }
    if (trigger.match === "keyword" && !keywordsMatch(trigger.keywords, trigger.mode)) return NO_TRIGGER_MATCH;
    const text = textSubject();
    if (text && matchesNegative(text, trigger.negativeKeywords)) return NO_TRIGGER_MATCH;
  } else if (trigger.type === "referral") {
    if (event.type !== "referral.received") return NO_TRIGGER_MATCH;
  } else if (trigger.type === "optin") {
    if (event.type !== "optin.received") return NO_TRIGGER_MATCH;
  } else if (trigger.type === "story_mention") {
    if (event.type !== "story_mention.received") return NO_TRIGGER_MATCH;
  } else if (trigger.type === "story_reply") {
    if (event.type !== "message.received" || !event.storyId) return NO_TRIGGER_MATCH;
    if (trigger.match === "keyword" && !keywordsMatch(trigger.keywords, trigger.mode)) return NO_TRIGGER_MATCH;
  } else if (trigger.type === "first_contact") {
    if (!context.isNewContact) return NO_TRIGGER_MATCH;
    if (!CONVERSATION_EVENT_TYPES.includes(event.type)) return NO_TRIGGER_MATCH;
  } else {
    const messageTrigger = trigger as MessageTrigger;
    // A tapped quick-reply chip arrives as quick_reply.received carrying the
    // chip's text; it has to reach keyword flows just like typed text, or the
    // chips a "quick replies" action sends lead nowhere.
    if (
      event.type !== "message.received"
      && event.type !== "quick_reply.received"
      && event.type !== "postback.received"
    ) return NO_TRIGGER_MATCH;
    // A story-reply flow owns replies to Stories; plain DM flows stay quiet so
    // the person doesn't get two answers to one message.
    if (event.storyId && context.storyReplyClaimed) return NO_TRIGGER_MATCH;
    if (messageTrigger.match === "keyword" && !keywordsMatch(messageTrigger.keywords, messageTrigger.mode)) {
      return NO_TRIGGER_MATCH;
    }
  }

  if (!matchesConditions(flow.conditions, event, textSubject)) return NO_TRIGGER_MATCH;
  return keyword === undefined ? { matched: true } : { matched: true, keyword };
}

export function matchesTrigger(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: EvaluationContext = {},
): boolean {
  return evaluateTrigger(flow, event, context).matched;
}
