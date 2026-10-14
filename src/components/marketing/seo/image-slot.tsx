import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { ImageSlot } from "@/src/content/seo/image-slots";
import { Icon } from "./mock-ui";
import styles from "./image-slot.module.css";

/*
 * A reserved photo. When the slot's file exists in public/ it renders with
 * next/image; until then a tinted placeholder holds its place. Development
 * builds label the placeholder with the slot key, size and path so whoever
 * generates the images can see where each one goes. Server only: it checks the
 * file system, so pages pick up a new file on the next build (or refresh in dev).
 */

const isProduction = process.env.NODE_ENV === "production";
const known = new Map<string, boolean>();

function slotFileExists(src: string): boolean {
  if (isProduction && known.has(src)) return known.get(src)!;
  let exists = false;
  try {
    exists = existsSync(path.join(process.cwd(), "public", src));
  } catch {
    exists = false;
  }
  if (isProduction) known.set(src, exists);
  return exists;
}

export function SeoImageSlot({ slot, sizes, className, fit = "cover", position, surface = "auto" }: {
  slot: ImageSlot;
  /** The rendered width at each breakpoint, as for next/image. */
  sizes: string;
  /** Sizes the box; the default box keeps the slot's aspect ratio. */
  className?: string;
  fit?: "cover" | "contain";
  /** object-position, e.g. "50% 30%". */
  position?: string;
  /**
   * What the placeholder sits on. "auto" follows the page theme; "light" keeps
   * it a pale tint of the accent on white in both themes, for slots inside
   * light mock UI or on light colour panels.
   */
  surface?: "auto" | "light";
}) {
  const style = { "--slot-ratio": `${slot.width} / ${slot.height}` } as CSSProperties;
  const classes = className ? `${styles.slot} ${className}` : styles.slot;

  if (slotFileExists(slot.src)) {
    return (
      <div className={classes} style={style}>
        <Image src={slot.src} alt={slot.alt} fill sizes={sizes} loading="lazy" style={{ objectFit: fit, objectPosition: position }} />
      </div>
    );
  }

  // Development only: the path also sits in a tooltip, since small slots hide the caption.
  return (
    <div
      className={`${classes} ${styles.placeholder}${surface === "light" ? ` ${styles.light}` : ""}`}
      style={style}
      data-image-slot={slot.id}
      data-key={slot.key}
      title={isProduction ? undefined : `${slot.key} · ${slot.width}×${slot.height} · ${slot.src}`}
      aria-hidden="true"
    >
      <Icon name="image" size={30} className={styles.slotIcon} />
      {isProduction ? null : (
        <span className={styles.caption}>
          <strong>IMAGE SLOT · {slot.key} · {slot.width}×{slot.height}</strong>
          <span>{slot.src}</span>
        </span>
      )}
    </div>
  );
}
