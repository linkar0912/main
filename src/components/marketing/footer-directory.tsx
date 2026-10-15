"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./marketing-footer.module.css";

export type FooterDirectoryLink = { label: string; href: string; path: string };
export type FooterDirectoryGroup = { title: string; href: string; path: string; links: readonly FooterDirectoryLink[] };

/**
 * Every feature guide, solution guide and workflow recipe, grouped by
 * collection. The only client part of the footer: it reads the current path
 * so the page being read and its collection are marked. On another host (the
 * auth screens) nothing is marked, like the header.
 */
export function FooterDirectory({ groups, markCurrent = true }: { groups: readonly FooterDirectoryGroup[]; markCurrent?: boolean }) {
  const pathname = usePathname();
  const current = markCurrent ? pathname : null;
  return (
    <nav className={styles.directory} aria-label="All guides and recipes">
      {groups.map((group) => {
        const inGroup = current !== null && (current === group.path || current.startsWith(`${group.path}/`));
        return (
          <div className={styles.directoryGroup} key={group.path} data-current={inGroup ? "" : undefined}>
            <p className={styles.directoryTitle}>
              <Link href={group.href} prefetch={false} aria-current={current === group.path ? "page" : undefined}>
                {group.title}
                <span className={styles.directoryCount}>{group.links.length}</span>
              </Link>
            </p>
            <ul>
              {group.links.map((link) => (
                <li key={link.path}>
                  {/* 64 links: prefetching them all when the footer scrolls into view would be wasteful. */}
                  <Link href={link.href} prefetch={false} aria-current={current === link.path ? "page" : undefined}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
