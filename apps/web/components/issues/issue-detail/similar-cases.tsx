/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";

// Finished cases similar to this work item, from the sprint-risk backend (agentick-backend) through Plane's proxy at /risk.
// Access is decided by Plane from the caller's session. Every case is a Plane page, so links never leave Plane.
type TSize = "small" | "medium" | "large";
type TSimilarCases = {
  sizes: Record<TSize, number>;
  cases: { key: string; title: string; size: TSize; days: number | null; path: string }[];
};

const SIZES: { size: TSize; opacity: number }[] = [
  { size: "small", opacity: 0.35 },
  { size: "medium", opacity: 0.65 },
  { size: "large", opacity: 1 },
];

async function fetchCases(issueId: string): Promise<TSimilarCases | null> {
  const response = await fetch(`/risk/api/v1/cases/${issueId}`, { credentials: "same-origin" });
  // 404 = no similar cases; any other failure also just hides the card. A non-JSON answer means the /risk route
  // is not deployed (Plane's web app answers with its HTML page), so there is nothing to parse.
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
  return (await response.json()) as TSimilarCases;
}

export function IssueSimilarCases(props: { issueId: string; className?: string }) {
  const { issueId, className = "" } = props;
  const { t } = useTranslation();
  const { data } = useSWR(`risk-cases-${issueId}`, () => fetchCases(issueId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const total = data ? data.sizes.small + data.sizes.medium + data.sizes.large : 0;
  if (!data || total === 0) return null;
  const top = SIZES.reduce((a, b) => (data.sizes[b.size] > data.sizes[a.size] ? b : a));
  const share = data.sizes[top.size] / total;
  // shortcut: fixed cut-offs. Even a clear majority is capped at "medium" because the benchmark showed similar cases
  // beat the project median by only about 6%; revisit once the full E6 run exists.
  const confidence = share >= 0.7 ? "medium" : "low";

  return (
    <div className={`flex flex-col gap-4 rounded-lg border border-subtle p-4 ${className}`}>
      <div className="flex flex-col gap-1">
        <div className="text-body-sm-medium">{t("similar_cases.title")}</div>
        <div className="text-body-md-medium">
          {share >= 0.5 ? t(`similar_cases.verdict_${top.size}`) : t("similar_cases.verdict_mixed")}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-layer-1">
          {SIZES.map(({ size, opacity }) => (
            <div
              key={size}
              className="h-full bg-accent-primary"
              style={{ width: `${(data.sizes[size] / total) * 100}%`, opacity }}
            />
          ))}
        </div>
        <div className="text-body-xs-regular text-secondary">
          {t("similar_cases.breakdown", { total, ...data.sizes })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-body-xs-medium text-secondary">{t("similar_cases.examples")}</div>
        <ul className="flex flex-col gap-2">
          {data.cases.map((c) => (
            <li key={c.path} className="flex flex-col gap-0.5 text-body-xs-regular">
              <Link href={c.path} className="min-w-0 truncate hover:underline" title={c.title}>
                <span className="text-accent-primary">{c.key}</span> {c.title}
              </Link>
              <span className="text-tertiary">
                {t(`similar_cases.size_${c.size}`)}
                {c.days !== null &&
                  ` · ${c.days < 1 ? t("similar_cases.days_less") : t("similar_cases.days", { days: Math.round(c.days) })}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-body-xs-medium">{t(`similar_cases.confidence_${confidence}_title`)}</span>
        <span className="text-body-xs-regular text-secondary">
          {t(`similar_cases.confidence_${confidence}`, {
            count: data.sizes[top.size],
            total,
            size: t(`similar_cases.size_${top.size}`).toLowerCase(),
          })}
        </span>
      </div>

      <div className="text-caption-sm-regular text-tertiary">{t("similar_cases.scale_note")}</div>
    </div>
  );
}
