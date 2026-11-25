"use client";

import { ChatCircleDots, Checks, GitCommit, GitMerge } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const tabs = [
  { id: "conversation", label: "Try it", icon: ChatCircleDots },
  { id: "commits", label: "How it works", icon: GitCommit, count: 3 },
  { id: "checks", label: "Checks", icon: Checks, count: 4 },
  { id: "merge", label: "Use it", icon: GitMerge }
];

/** The pull-request tabs: in-page links whose current tab follows the reader's position. */
export function PrTabs() {
  const [current, setCurrent] = useState("conversation");
  useEffect(() => {
    const sections = tabs.map((tab) => document.getElementById(tab.id)).filter((element): element is HTMLElement => element !== null);
    const update = () => {
      const line = 140;
      let active = sections[0]?.id ?? "conversation";
      for (const section of sections) if (section.getBoundingClientRect().top <= line) active = section.id;
      setCurrent(active);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="pr-tabs">
      <div className="shell">
        <nav aria-label="On this page">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <a key={id} href={`#${id}`} aria-current={current === id ? "true" : undefined}>
              <Icon weight="bold" aria-hidden />
              {label}
              {count ? <span className="count">{count}</span> : null}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
