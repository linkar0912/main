"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Submit button for the auth forms: disabled with a pending label while the
 * form is submitting, so a slow network does not invite a second click (a
 * double-submitted login burns a rate-limit attempt; a double signup sends two
 * emails). useFormStatus covers forms driven by a React action; the auth
 * forms are plain HTML POSTs (they must work before hydration), which React
 * does not track, so the native submit event is observed as well.
 */
export function SubmitButton({ children, pendingLabel, className = "button button-primary", style }: SubmitButtonProps) {
  const { pending: actionPending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;
    const onSubmit = (event: SubmitEvent) => {
      if (!event.defaultPrevented) setSubmitted(true);
    };
    // Returning via the back button restores the page from the bfcache with
    // the button still disabled; re-enable it.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitted(false);
    };
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const pending = actionPending || submitted;
  return (
    <button
      ref={buttonRef}
      className={className}
      style={style}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
