/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { WarningTriangleOutline } from "@makeplane/propel/icons";
import { ActivityTimelineItem } from "@plane/blocks/activity";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
// local imports
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

// Sprint-risk backend (agentick-backend), reached through Plane's own proxy at /risk. It decides who may see an alert by
// asking Plane about the caller's session, so this component sends no credentials of its own.
const RISK_API = "/risk/api/v1/alerts";

type TRiskAlert = {
  work_item_id: string;
  comment_id: string;
  mark: number;
  rank: number;
  size: number;
  score: number;
  status: string;
  inactive_days: number;
  changes: string[];
  action_type: "raise_priority" | "nudge_owner" | "move_next_cycle" | "assign_owner" | "split";
  action_text: string | null;
  cause: "waiting_on_person" | "blocked_by_issue" | "needs_decision" | "unclear_scope" | "not_started" | null;
  evidence_quote: string | null;
  state: "pending" | "approved" | "dismissed";
  decided_by: string | null;
};

class RiskRequestError extends Error {}

async function riskRequest(path: string, init?: RequestInit): Promise<TRiskAlert | null> {
  const response = await fetch(`${RISK_API}/${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (response.status === 404) return null; // no alert for this work item: render nothing
  // Plane's web app answers with its HTML page when the /risk route is not deployed: no alert, not an error
  if (response.ok && !response.headers.get("content-type")?.includes("application/json")) return null;
  if (!response.ok) throw new RiskRequestError(String(response.status));
  return (await response.json()) as TRiskAlert;
}

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  commentId: string;
  disabled: boolean;
};

export function IssueRiskDecision(props: Props) {
  const { workspaceSlug, projectId, issueId, commentId, disabled } = props;
  // states
  const [isBusy, setIsBusy] = useState(false);
  // hooks
  const { t } = useTranslation();
  const {
    issue: { fetchIssue },
  } = useIssueDetail();
  const { data: alert, mutate } = useSWR(`risk-alert-${issueId}`, () => riskRequest(issueId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  // rendered under every comment; only the bot's brief for this alert gets the buttons
  if (!alert || alert.comment_id !== commentId) return null;

  // Every action returns the new alert state; priority may have changed too, so refresh the work item as well.
  const act = async (path: string, body?: object) => {
    setIsBusy(true);
    try {
      const updated = await riskRequest(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await mutate(updated, { revalidate: false });
      await fetchIssue(workspaceSlug, projectId, issueId);
    } catch {
      setToast({ type: "error", title: t("risk_alert.error_title"), message: t("risk_alert.error") });
    } finally {
      setIsBusy(false);
    }
  };

  const decided = alert.state !== "pending";
  // the first three are carried out in Plane on approval; the others are advice a person acts on
  const isExecuted = ["raise_priority", "nudge_owner", "move_next_cycle"].includes(alert.action_type);
  const approveLabel = isExecuted ? t(`risk_alert.approve_${alert.action_type}`) : t("risk_alert.approve_advice");

  return (
    <ActivityTimelineItem icon={<WarningTriangleOutline />} actor={t("risk_alert.title")}>
      <span className="text-tertiary">
        ·{" "}
        {decided ? t(`risk_alert.state_${alert.state}`, { by: alert.decided_by ?? "" }) : t("risk_alert.state_pending")}
      </span>
      <p className="mt-1 text-caption-sm-regular text-tertiary">
        {t("risk_alert.raised_at", { percent: Math.round(alert.mark * 100) })}
      </p>
      {alert.cause && (
        <div className="mt-2">
          <p className="text-body-sm-medium text-secondary">
            {t("risk_alert.why_stuck")} {t(`risk_alert.cause_${alert.cause}`)}
          </p>
          {alert.evidence_quote && (
            <p className="mt-1 border-l-2 border-subtle pl-2 text-body-sm-regular text-tertiary">
              {alert.evidence_quote}
            </p>
          )}
        </div>
      )}
      {!decided && alert.action_type === "nudge_owner" && alert.action_text && (
        <div className="mt-2">
          <p className="text-caption-sm-regular text-tertiary">{t("risk_alert.plan_nudge_owner")}</p>
          <p className="mt-1 border-l-2 border-subtle pl-2 text-body-sm-regular text-secondary">{alert.action_text}</p>
        </div>
      )}
      {!decided && alert.action_type === "move_next_cycle" && (
        <p className="mt-2 text-body-sm-regular text-secondary">{t("risk_alert.plan_move_next_cycle")}</p>
      )}
      {!decided && !isExecuted && (
        <p className="mt-2 text-body-sm-regular text-secondary">{t(`risk_alert.advice_${alert.action_type}`)}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {decided ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            stretch="auto"
            label={t("risk_alert.undo")}
            onClick={() => act(`${issueId}/undo`)}
            disabled={disabled || isBusy}
          />
        ) : (
          <>
            <Button
              type="button"
              variant="primary"
              size="md"
              stretch="auto"
              label={approveLabel}
              onClick={() => act(`${issueId}/decision`, { decision: "approve" })}
              disabled={disabled || isBusy}
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              stretch="auto"
              label={t("risk_alert.dismiss")}
              onClick={() => act(`${issueId}/decision`, { decision: "reject" })}
              disabled={disabled || isBusy}
            />
          </>
        )}
      </div>
    </ActivityTimelineItem>
  );
}
