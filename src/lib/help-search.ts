import { Children, isValidElement, type ReactNode } from "react";

type SearchableTopic = { title: string; blurb: string };
type SearchableArticle = { question: string; answer: ReactNode };

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return Children.toArray(node).map(textFromNode).join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function helpArticleMatchesQuery(
  topic: SearchableTopic,
  article: SearchableArticle,
  query: string,
): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = normalize([
    topic.title,
    topic.blurb,
    article.question,
    textFromNode(article.answer),
  ].join(" "));
  return haystack.includes(needle);
}

export function normalizeHelpQuery(query: string): string {
  return normalize(query).slice(0, 120);
}
