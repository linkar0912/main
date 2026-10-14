/**
 * The tip title with its last word marked by a hand-drawn underline (Manychat's
 * scribble). A very short last word ("it", "DM") takes the word before it too,
 * so the mark never sits under two letters. The text itself is unchanged.
 */
export function ScribbleTitle({ text, markClassName }: { text: string; markClassName: string }) {
  const words = text.trim().split(/\s+/);
  const take = words.length > 1 && words[words.length - 1].length <= 3 ? 2 : 1;
  const head = words.slice(0, words.length - take).join(" ");
  const tail = words.slice(words.length - take).join(" ");
  return (
    <>
      {head ? `${head} ` : null}
      <span className={markClassName}>{tail}</span>
    </>
  );
}
