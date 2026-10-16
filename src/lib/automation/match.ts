import { logger } from "../logger";
import type { CommentTrigger, EvaluationContext, FlowCondition, FlowDefinitionV1, MessageTrigger, NormalizedEvent } from "./types";

/**
 * Instagram caps a comment at 2,200 characters (counted as code points, so an
 * emoji is one); text past that is never matched.
 */
export const MAX_MATCH_TEXT_LENGTH = 2_200;
/** Longest regex keyword the engine runs. Longer patterns never match (and cannot be saved). */
export const MAX_REGEX_KEYWORD_LENGTH = 100;
/** Compiled keyword matchers kept between events. */
export const KEYWORD_MATCHER_CACHE_SIZE = 2_000;
/** Longer (legacy) keywords are compiled per use so one oversized keyword cannot pin cache memory. */
const MAX_CACHED_KEYWORD_LENGTH = 256;

type KeywordMode = NonNullable<CommentTrigger["mode"]>;
/** The modes results and matchers are kept under: "all" checks each keyword as "any" does. */
type CacheMode = Exclude<KeywordMode, "all">;

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
// Every keyword check for one event spends from a single work budget shared
// by all the automations checked against that event (see eventStateFor), so
// the worker's cost per event stays bounded however many keywords a
// workspace has.
// ---------------------------------------------------------------------------

/** Program size and repeat count limits keep the per-character work small. */
const MAX_REGEX_PROGRAM_SIZE = 250;
const MAX_REGEX_REPEAT = 1_000;
/**
 * Keyword work one event may cost, shared by every automation checked against
 * it. A unit is one regex engine operation: a text position, a character test
 * (a few more for a non-ASCII character, which takes a binary search), an
 * instruction visited while following moves that consume no text, or a
 * compile step. Measured on the worker, regex patterns cost about 2 to 20
 * units per character, so roughly 50 to 80 non-matching regex keywords fit on
 * a 2,200-character non-ASCII comment (far more on a typical short DM), and
 * spending all 2,000,000 units takes about 19 ms. "any" and "all" keywords
 * spend from the same budget, priced in units of the same worker time (see
 * phraseMatcher). Once the budget runs out the event's remaining regex, "any"
 * and "all" keyword checks count as no match, which keeps the worst case to a
 * few tens of milliseconds of worker time per event.
 */
export const MAX_REGEX_STEPS_PER_EVENT = 2_000_000;
/** Fixed charge per regex keyword check, so thousands of cheap patterns are bounded too. */
const REGEX_CHECK_COST = 200;
/** Fixed charge per "any" or "all" keyword check, before its scan and match work. */
const PHRASE_CHECK_COST = 20;
/**
 * Fixed charge per "contains" or "exact" check. These are one substring test
 * or comparison, and negative keywords use them, so they always run; the
 * charge only makes them count toward the event's total.
 */
const SIMPLE_CHECK_COST = 20;
/** Characters V8's substring search scans per unit (about 0.6 ns per character at worst). */
const SCANNED_CHARS_PER_UNIT = 16;
/**
 * Character comparisons V8's regex engine makes per unit when it runs an
 * "any" phrase (roughly 1 to 1.6 ns each). Calibrated with the verifier's
 * bench so a budget spent on worst-case phrases costs about the same worker
 * time as one spent on worst-case regex patterns.
 */
const PHRASE_COMPARISONS_PER_UNIT = 6;
/**
 * Building a phrase pattern: V8 takes about 0.2 ms to compile its two Unicode
 * letter-or-digit classes, so it is only built once the cheap word scan passes.
 */
const PHRASE_COMPILE_COST = 20_000;
/** Building a phrase matcher normalizes the keyword; charged per keyword character. */
const PHRASE_SETUP_COST_PER_CHAR = 1;
/** Results kept per event; a check past this still runs, it just is not remembered. */
const MAX_RESULTS_PER_EVENT = 5_000;
/** Delay before the one budget warning per event, so it can count every check the event skipped. */
const BUDGET_WARNING_DELAY_MS = 1_000;

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

/**
 * Why a regex keyword cannot run: longer than {@link MAX_REGEX_KEYWORD_LENGTH}
 * (`too_long`), over the program size or repeat limits once its repeats are
 * counted (`too_large`), a lookaround, a backreference, inline flags, an
 * escape the engine does not know such as \p{...} (`unsupported_escape`), two
 * named groups with one name (`duplicate_name`), or not valid regex syntax.
 */
export type RegexRefusalReason =
  | "too_long"
  | "too_large"
  | "lookaround"
  | "backreference"
  | "inline_flags"
  | "unsupported_escape"
  | "duplicate_name"
  | "syntax";

class RegexSyntaxError extends Error {
  constructor(message: string, readonly reason: RegexRefusalReason = "syntax") {
    super(message);
  }
}

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
  /**
   * Named groups seen so far. JavaScript allows a repeated name only in
   * different alternatives; refusing every repeat is stricter but never
   * accepts a pattern JavaScript rejects.
   */
  const groupNames = new Set<string>();

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
      throw new RegexSyntaxError("Repeat count too large", "too_large");
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
        if (isDigitCode(pattern.charCodeAt(index))) {
          throw new RegexSyntaxError("Octal escapes are not supported", "unsupported_escape");
        }
        return 0;
      case "x":
      case "u": {
        // Without enough hex digits JavaScript reads \x and \u as plain letters.
        const hex = (char === "x" ? /^[0-9a-fA-F]{2}/ : /^[0-9a-fA-F]{4}/).exec(pattern.slice(index));
        if (!hex) return char.charCodeAt(0);
        index += hex[0].length;
        return Number.parseInt(hex[0], 16);
      }
      case "k":
        throw new RegexSyntaxError("Named backreferences are not supported", "backreference");
      case "c":
      case "p":
      case "P":
        throw new RegexSyntaxError(`\\${char} is not supported`, "unsupported_escape");
      default:
        if (char >= "1" && char <= "9") throw new RegexSyntaxError("Backreferences are not supported", "backreference");
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
      const rest = pattern.slice(index + 1);
      const name = /^<([A-Za-z_$][\w$]*)>/.exec(rest);
      if (pattern[index + 1] === ":") {
        index += 2;
      } else if (name) {
        if (groupNames.has(name[1])) throw new RegexSyntaxError("Duplicate capture group name", "duplicate_name");
        groupNames.add(name[1]);
        index += 1 + name[0].length;
      } else if (/^(?:[=!]|<[=!])/.test(rest)) {
        throw new RegexSyntaxError("Lookarounds are not supported", "lookaround");
      } else if (/^[a-zA-Z]*-?[a-zA-Z]*[:)]/.test(rest)) {
        throw new RegexSyntaxError("Inline flags are not supported", "inline_flags");
      } else {
        throw new RegexSyntaxError("Invalid group");
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
    if (program.length >= MAX_REGEX_PROGRAM_SIZE) throw new RegexSyntaxError("Pattern is too large", "too_large");
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
 *
 * Only the first `limit` code units are consumed, but ^, $, \b and \B look at
 * the whole string: $ holds only at its real end and \b at the limit sees the
 * character that follows, so a cut never invents a word or text boundary.
 */
function runProgram(regex: CompiledRegex, text: string, limit: number, budget: RegexBudget): boolean {
  if (budget.steps <= 0) return false;
  const { program, anchored } = regex;
  const size = program.length;
  const textLength = text.length;
  const scanLength = Math.min(limit, textLength);
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
  for (let position = 0; !matched && position < scanLength; position += 1) {
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

type CompileResult =
  | { regex: CompiledRegex; reason?: undefined }
  | { regex: null; reason: RegexRefusalReason };

/** Parses and compiles a pattern, adding the work spent to `work`; says why when it cannot run. */
function compileRegex(pattern: string, work: CompileWork): CompileResult {
  work.units += pattern.length;
  if (pattern.length === 0) return { regex: null, reason: "syntax" };
  if (pattern.length > MAX_REGEX_KEYWORD_LENGTH) return { regex: null, reason: "too_long" };
  try {
    const { node, anchored } = parseRegex(pattern, work);
    const program = compileProgram(node);
    work.units += program.length;
    return { regex: { program, anchored } };
  } catch (error) {
    return { regex: null, reason: error instanceof RegexSyntaxError ? error.reason : "syntax" };
  }
}

/**
 * Compiles a regex keyword for the linear-time engine. Returns null when the
 * pattern is empty, longer than {@link MAX_REGEX_KEYWORD_LENGTH}, or uses
 * syntax the engine does not support (see {@link describeRegexKeyword} for
 * why); such a pattern never matches. The test runs over the whole `text`,
 * spends from `budget` (a fresh per-event budget when omitted) and reports no
 * match once it is used up.
 */
export function compileRegexKeyword(pattern: string): ((text: string, budget?: RegexBudget) => boolean) | null {
  const { regex } = compileRegex(pattern, { units: 0 });
  if (!regex) return null;
  return (text, budget = { steps: MAX_REGEX_STEPS_PER_EVENT }) => runProgram(regex, text, text.length, budget);
}

/** Why a regex keyword cannot run, or null when it compiles. */
export function describeRegexKeyword(pattern: string): RegexRefusalReason | null {
  return compileRegex(pattern, { units: 0 }).reason ?? null;
}

// ---------------------------------------------------------------------------
// Keyword matchers
// ---------------------------------------------------------------------------

/**
 * Keyword work and results for one event, for every match mode. Every
 * automation checked against the event (including the two-step campaigns
 * checked first and the runner's second pass over story-reply flows) shares
 * the budget, and a keyword already checked in a mode reuses its result, so
 * checking a flow twice gives the same answer and costs nothing the second
 * time, and a keyword repeated across automations is checked once per event.
 */
type RegexEventState = {
  raw: string;
  eventId?: string;
  budget: RegexBudget;
  /**
   * Results by mode, then keyword ("all" shares the "any" entries). One map
   * per mode keys on the keyword string itself, whose hash V8 keeps, so a
   * lookup never builds a combined key.
   */
  results: Record<CacheMode, Map<string, boolean>>;
  /** How many results are kept, against MAX_RESULTS_PER_EVENT. */
  resultCount: number;
  /** Regex keywords checked this event that cannot compile. */
  unsupported: Set<string>;
  /** Regex, "any" and "all" checks counted as no match because the budget was spent. */
  skipped: number;
  /** Set once the budget is spent, so the event logs a single warning. */
  warned: boolean;
};
/** The worker handles a few events at once, so several events keep their state. */
const RECENT_EVENTS = 32;
const recentEvents = new Map<string, RegexEventState>();

function eventStateFor(raw: string, eventId: string | undefined): RegexEventState {
  const fresh = (): RegexEventState => ({
    raw,
    ...(eventId === undefined ? {} : { eventId }),
    budget: { steps: MAX_REGEX_STEPS_PER_EVENT },
    results: { any: new Map(), regex: new Map(), contains: new Map(), exact: new Map() },
    resultCount: 0,
    unsupported: new Set(),
    skipped: 0,
    warned: false,
  });
  if (eventId === undefined) return fresh();
  const known = recentEvents.get(eventId);
  const state = known?.raw === raw ? known : fresh();
  recentEvents.delete(eventId);
  recentEvents.set(eventId, state);
  if (recentEvents.size > RECENT_EVENTS) {
    const oldest = recentEvents.keys().next().value;
    if (oldest !== undefined) recentEvents.delete(oldest);
  }
  return state;
}

/**
 * Logs one warning per event once its budget is spent. The warning waits a
 * moment so it can report how many keyword checks the event skipped in all.
 */
function noteBudgetSpent(state: RegexEventState): void {
  if (state.warned || state.budget.steps > 0) return;
  state.warned = true;
  const timer: unknown = setTimeout(() => {
    logger.warn("Keyword matching spent its work budget for an event; later keyword checks counted as no match", {
      ...(state.eventId === undefined ? {} : { eventId: state.eventId }),
      skippedKeywordChecks: state.skipped,
    });
  }, BUDGET_WARNING_DELAY_MS);
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/** The event text, cut to its first 2,200 characters and normalized once, shared by every keyword check. */
type MatchSubject = {
  /** The whole event text: regex keywords consume only its first `limit` code units. */
  raw: string;
  /** Code-unit index just past the first {@link MAX_MATCH_TEXT_LENGTH} code points of `raw`. */
  limit: number;
  /** `raw` up to `limit`, normalized for the other modes. */
  normalized: string;
  eventId?: string;
  state?: RegexEventState;
};
/** Tests one keyword, spending from `budget` for work beyond its fixed charge. */
type KeywordMatcher = (subject: MatchSubject, budget: RegexBudget) => boolean;

const neverMatches: KeywordMatcher = () => false;
/** A regex keyword that does not compile; kept apart so a trigger can report it. */
const unsupportedRegex: KeywordMatcher = () => false;
let lastNormalized: { raw: string; limit: number; normalized: string } | undefined;

/** Code-unit index just past the first MAX_MATCH_TEXT_LENGTH code points of `text`. */
function matchLimit(text: string): number {
  if (text.length <= MAX_MATCH_TEXT_LENGTH) return text.length;
  let index = 0;
  for (let count = 0; count < MAX_MATCH_TEXT_LENGTH && index < text.length; count += 1) {
    const code = text.charCodeAt(index);
    const pair = code >= 0xd800 && code <= 0xdbff && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00;
    index += pair ? 2 : 1;
  }
  return index;
}

/** The runner checks every automation against the same event, so the last normalized text is reused. */
function subjectFor(text: string, eventId?: string): MatchSubject {
  if (lastNormalized?.raw !== text) {
    const limit = matchLimit(text);
    lastNormalized = { raw: text, limit, normalized: normalizedText(limit < text.length ? text.slice(0, limit) : text) };
  }
  return { raw: text, limit: lastNormalized.limit, normalized: lastNormalized.normalized, eventId };
}

function eventState(subject: MatchSubject): RegexEventState {
  subject.state ??= eventStateFor(subject.raw, subject.eventId);
  return subject.state;
}

/** The phrase as a V8 pattern: words joined by flexible whitespace, never inside a longer word. */
function phrasePattern(normalizedKeyword: string, words: string[]): RegExp {
  const startsWithWordCharacter = /^[\p{L}\p{N}_]/u.test(normalizedKeyword);
  const endsWithWordCharacter = /[\p{L}\p{N}_]$/u.test(normalizedKeyword);
  return new RegExp([
    startsWithWordCharacter ? "(?<![\\p{L}\\p{N}_])" : "",
    words.map(escapeRegex).join("\\s+"),
    endsWithWordCharacter ? "(?![\\p{L}\\p{N}_])" : "",
  ].join(""), "u");
}

/**
 * "any" and "all": the keyword as a whole phrase, with flexible whitespace,
 * on V8's regex engine, charged for the work it can cost. Every word of the
 * phrase has to appear somewhere in the text before the phrase can, so a
 * substring scan per word (charged per character scanned) rules out most
 * keywords before the pattern is even built. When every word is there, the
 * pattern is built once (PHRASE_COMPILE_COST) and run, charged for up to one
 * comparison per keyword character at every position it scanned. A check
 * that finds the budget spent partway counts as no match.
 */
function phraseMatcher(normalizedKeyword: string): KeywordMatcher {
  const words = normalizedKeyword.split(/\s+/u);
  const distinctWords = [...new Set(words)];
  let pattern: RegExp | undefined;
  return (subject, budget) => {
    const text = subject.normalized;
    for (const word of distinctWords) {
      const found = text.indexOf(word);
      budget.steps -= Math.ceil((found < 0 ? text.length : found + word.length) / SCANNED_CHARS_PER_UNIT);
      if (found < 0) return false;
    }
    if (budget.steps <= 0) return false;
    if (!pattern) {
      pattern = phrasePattern(normalizedKeyword, words);
      budget.steps -= PHRASE_COMPILE_COST;
    }
    const match = pattern.exec(text);
    const scanned = match ? match.index + match[0].length : text.length;
    budget.steps -= Math.ceil((scanned * normalizedKeyword.length) / PHRASE_COMPARISONS_PER_UNIT);
    return match !== null;
  };
}

/** Builds one keyword's matcher, charging `budget` for the work. */
function compileKeywordMatcher(mode: KeywordMode, keyword: string, budget: RegexBudget): KeywordMatcher {
  if (mode === "regex") {
    const work: CompileWork = { units: 0 };
    const { regex } = compileRegex(keyword, work);
    budget.steps -= work.units;
    // Regex runs on the raw text so patterns keep their meaning.
    return regex ? (subject, spend) => runProgram(regex, subject.raw, subject.limit, spend) : unsupportedRegex;
  }
  const normalizedKeyword = normalizedText(keyword);
  if (mode === "contains") return normalizedKeyword ? (subject) => subject.normalized.includes(normalizedKeyword) : neverMatches;
  if (mode === "exact") return normalizedKeyword ? (subject) => subject.normalized === normalizedKeyword : neverMatches;
  budget.steps -= keyword.length * PHRASE_SETUP_COST_PER_CHAR;
  return normalizedKeyword ? phraseMatcher(normalizedKeyword) : neverMatches;
}

const matcherCache = new Map<string, KeywordMatcher>();

/** A compiled matcher from a bounded LRU keyed by mode and (trimmed) keyword; `budget` pays for a compile. */
function keywordMatcher(mode: KeywordMode, keyword: string, budget: RegexBudget): KeywordMatcher {
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

/**
 * Whether a (trimmed) regex keyword is known not to compile: too long to run,
 * or found not to compile when this event checked it. A keyword the event
 * never got to (its budget ran out first) counts as one that compiles.
 */
function knownUnsupportedRegex(state: RegexEventState, keyword: string): boolean {
  return keyword.length > MAX_REGEX_KEYWORD_LENGTH || state.unsupported.has(keyword);
}

/**
 * Whether one (trimmed, non-empty) keyword matches. Results are kept for the
 * rest of the event. Regex, "any" and "all" checks spend from the event's
 * budget and count as no match once it is spent; "contains" and "exact"
 * checks are one substring test or comparison and decide negative keywords,
 * so they pay a small fixed charge and always run.
 */
function keywordMatches(subject: MatchSubject, mode: KeywordMode, keyword: string): boolean {
  const cacheMode: CacheMode = mode === "all" ? "any" : mode;
  const state = eventState(subject);
  const results = state.results[cacheMode];
  const known = results.get(keyword);
  if (known !== undefined) return known;
  const { budget } = state;
  let matched = false;
  if (cacheMode === "contains" || cacheMode === "exact") {
    budget.steps -= SIMPLE_CHECK_COST;
    matched = keywordMatcher(cacheMode, keyword, budget)(subject, budget);
  } else {
    if (budget.steps > 0) budget.steps -= cacheMode === "regex" ? REGEX_CHECK_COST : PHRASE_CHECK_COST;
    if (budget.steps > 0) {
      const matcher = keywordMatcher(cacheMode, keyword, budget);
      if (matcher === unsupportedRegex) state.unsupported.add(keyword);
      matched = matcher(subject, budget);
    }
    if (!matched && budget.steps <= 0) state.skipped += 1;
  }
  noteBudgetSpent(state);
  if (state.resultCount < MAX_RESULTS_PER_EVENT) {
    results.set(keyword, matched);
    state.resultCount += 1;
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

/** The indexes of the regex keywords in the list known not to compile. */
function unsupportedRegexIndexes(subject: MatchSubject, keywords: string[]): number[] {
  const state = eventState(subject);
  return keywords.flatMap((keyword, index) => {
    const trimmed = keyword.trim();
    return trimmed !== "" && knownUnsupportedRegex(state, trimmed) ? [index] : [];
  });
}

/** Whether any regex keyword in the list is known not to compile. */
function hasUnsupportedRegex(subject: MatchSubject, keywords: string[]): boolean {
  const state = eventState(subject);
  return keywords.some((keyword) => {
    if (keyword.length <= MAX_REGEX_KEYWORD_LENGTH && state.unsupported.size === 0) return false;
    const trimmed = keyword.trim();
    return trimmed !== "" && knownUnsupportedRegex(state, trimmed);
  });
}

type KeywordMatch = { matched: false; unsupportedPattern?: true } | { matched: true; keyword: string };
const NO_KEYWORD_MATCH: KeywordMatch = { matched: false };
const UNSUPPORTED_KEYWORD_MATCH: KeywordMatch = { matched: false, unsupportedPattern: true };

/**
 * Evaluate a trigger's keyword list using the configured match mode. "any"
 * (the default) needs one keyword as a whole phrase, "all" needs every
 * keyword, "exact" matches the whole normalized text, "regex" runs each entry
 * on the linear-time engine, and "contains" is a substring check. Returns the
 * matched keyword (for "all", the first one) for {keyword} personalization,
 * or, for "regex", whether a keyword that cannot compile was among the misses.
 */
function matchKeywords(
  subject: MatchSubject,
  keywords: string[],
  mode: KeywordMode | undefined,
): KeywordMatch {
  const effectiveMode = mode ?? "any";
  if (effectiveMode !== "all") {
    const keyword = firstMatchingKeyword(subject, keywords, effectiveMode);
    if (keyword !== undefined) return { matched: true, keyword };
    return effectiveMode === "regex" && hasUnsupportedRegex(subject, keywords) ? UNSUPPORTED_KEYWORD_MATCH : NO_KEYWORD_MATCH;
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

/**
 * The first keyword that appears in `text` (normalized), for {keyword}
 * personalization. With `eventId` the checks share that event's budget and
 * results with every other check against it.
 */
export function findMatchedKeyword(
  text: string | undefined,
  keywords: string[],
  mode: CommentTrigger["mode"] = "any",
  eventId?: string,
): string | undefined {
  if (!text) return undefined;
  return firstMatchingKeyword(subjectFor(text, eventId), keywords, mode ?? "any");
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

export type TriggerMatch =
  | {
    matched: false;
    /**
     * Set when a regex trigger missed and at least one of its keywords cannot
     * compile (saved before the matcher's rules): the automation keeps
     * running but never matches until the pattern is fixed.
     */
    unsupportedPattern?: true;
  }
  | { matched: true; keyword?: string };
const NO_TRIGGER_MATCH: TriggerMatch = { matched: false };
const UNSUPPORTED_PATTERN_MATCH: TriggerMatch = { matched: false, unsupportedPattern: true };

/** The evaluation context, plus the automation's id when the caller has it, for logs. */
export type TriggerEvaluationContext = EvaluationContext & { automationId?: string };

/** Automations already reported this process, so a broken one logs once rather than once per event. */
const reportedUnsupported = new Set<string>();
const MAX_REPORTED_UNSUPPORTED = 10_000;

/** A short FNV-1a hash, so a keyword list can stand in for an automation without keeping its text. */
function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** One warning per automation per process; names the automation, never the pattern text. */
function warnUnsupportedPattern(
  trigger: { type: string; keywords: string[] },
  event: NormalizedEvent,
  context: TriggerEvaluationContext,
  keywordIndexes: () => number[],
): void {
  // Without the automation's id, its account and keyword list stand in for it.
  const key = context.automationId ?? `${event.accountId}\u0000${hashText(trigger.keywords.join("\u0001"))}`;
  if (reportedUnsupported.has(key)) return;
  if (reportedUnsupported.size >= MAX_REPORTED_UNSUPPORTED) reportedUnsupported.clear();
  reportedUnsupported.add(key);
  logger.warn("A regex automation has a keyword the matcher cannot run, so it never matches until the pattern is fixed", {
    ...(context.automationId ? { automationId: context.automationId } : {}),
    accountId: event.accountId,
    triggerType: trigger.type,
    keywordIndexes: keywordIndexes(),
  });
}

/**
 * Whether `event` fires `flow`, plus the keyword that matched for keyword
 * triggers, so callers do not scan the keyword list a second time. A regex
 * trigger that missed because a keyword cannot compile says so with
 * `unsupportedPattern`.
 */
export function evaluateTrigger(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: TriggerEvaluationContext = {},
): TriggerMatch {
  const trigger = flow.trigger;
  let subject: MatchSubject | undefined;
  const textSubject = () => (event.text ? (subject ??= subjectFor(event.text, event.id)) : undefined);
  let keyword: string | undefined;
  let unsupportedPattern = false;
  const keywordsMatch = (keywords: string[], mode: KeywordMode | undefined): boolean => {
    const text = textSubject();
    const result = text ? matchKeywords(text, keywords, mode) : NO_KEYWORD_MATCH;
    if (result.matched) keyword = result.keyword;
    else if (text && result.unsupportedPattern) {
      unsupportedPattern = true;
      warnUnsupportedPattern({ type: trigger.type, keywords }, event, context, () => unsupportedRegexIndexes(text, keywords));
    }
    return result.matched;
  };
  /** The result for a keyword trigger whose keywords did not match. */
  const keywordMiss = (): TriggerMatch => (unsupportedPattern ? UNSUPPORTED_PATTERN_MATCH : NO_TRIGGER_MATCH);

  if (trigger.type === "comment") {
    if (event.type !== "comment.created") return NO_TRIGGER_MATCH;
    if (trigger.mediaIds.length > 0 && (!event.mediaId || !trigger.mediaIds.includes(event.mediaId))) {
      return NO_TRIGGER_MATCH;
    }
    if (trigger.match === "keyword" && !keywordsMatch(trigger.keywords, trigger.mode)) {
      return keywordMiss();
    }
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
    if (trigger.match === "keyword" && !keywordsMatch(trigger.keywords, trigger.mode)) {
      return keywordMiss();
    }
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
      return keywordMiss();
    }
  }

  if (!matchesConditions(flow.conditions, event, textSubject)) return NO_TRIGGER_MATCH;
  return keyword === undefined ? { matched: true } : { matched: true, keyword };
}

export function matchesTrigger(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: TriggerEvaluationContext = {},
): boolean {
  return evaluateTrigger(flow, event, context).matched;
}
