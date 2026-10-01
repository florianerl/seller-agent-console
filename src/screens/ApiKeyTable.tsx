import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { z } from "zod";
import { apiKeyById, ApiKeySummary, apiKeys, revokeApiKey } from "../api/endpoints";
import { describe } from "../api/errors";
import { ConfirmAction } from "../components/ConfirmAction";
import { Hint } from "../components/Hint";
import { StatusChip } from "../components/StatusChip";
import { ReadForm } from "../components/WriteForm";
import { useCredential } from "../credentials/context";
import { CADENCE } from "../query/cadence";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

// The list route is read for its status code elsewhere, so its schema is
// `z.unknown()` on purpose. This table parses what it can on its own and shows
// nothing, rather than failing, when the body is not the shape it knows.
const KeyListBody = z.union([
  z.array(ApiKeySummary),
  z.object({ keys: z.array(ApiKeySummary) }).loose().transform((b) => b.keys),
]);

/**
 * Every key the agent lists, each with Load (its metadata, read on demand) and
 * Revoke (behind a confirmation). A table rather than a typed id: nobody holds
 * key ids in their head, and the list is what a revoke should be chosen from.
 */
export function ApiKeyTable() {
  const { writesEnabled } = useCredential();
  // Same key as the Console access card, so opening the dialog costs no request.
  const list = useResource("api-keys", apiKeys, { refreshInterval: CADENCE.health });
  const [loaded, setLoaded] = useState<string | undefined>();
  const [target, setTarget] = useState<string | undefined>();
  // Outlives the dialog, so the row can say Working… while the call is out.
  const [revoking, setRevoking] = useState<string | undefined>();

  const revoke = useMutation<{ id: string }, unknown>(
    (c, args) => revokeApiKey(c, args.id),
    { invalidates: (args) => ["api-keys", `api-key:${args.id}`] },
  );

  const parsed = KeyListBody.safeParse(list.data);
  const keys = parsed.success ? parsed.data : [];

  if (list.loading && list.data === undefined) {
    return <Typography variant="body2">Loading keys…</Typography>;
  }
  if (list.data === undefined || !parsed.success) {
    return (
      <Typography variant="body2" color="text.secondary">
        {list.result && list.result.kind !== "ok"
          ? `${describe(list.result)} — the key list is unavailable.`
          : "The key list is unavailable."}
      </Typography>
    );
  }

  return (
    <Box data-block="api-key-table">
      {keys.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No API keys listed.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key id</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map((k) => {
              const active = k.is_active !== false;
              return (
                <KeyRows
                  key={k.key_id}
                  id={k.key_id}
                  label={k.label ?? ""}
                  role={k.role ?? "—"}
                  active={active}
                  open={loaded === k.key_id}
                  pending={revoke.pending && revoking === k.key_id}
                  canRevoke={writesEnabled && active}
                  blockedHint={
                    !writesEnabled
                      ? "Writes are switched off. Turn them on from the connection menu to use this."
                      : undefined
                  }
                  onLoad={() => setLoaded(loaded === k.key_id ? undefined : k.key_id)}
                  onRevoke={() => setTarget(k.key_id)}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
      <Typography variant="caption" component="p" sx={{ mt: 1, color: palette.textSecondary }}>
        {list.asOf !== undefined && `as of ${new Date(list.asOf).toLocaleTimeString()}`}
      </Typography>
      {revoke.last && revoke.last.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(revoke.last)}
        </Typography>
      )}
      {revoke.last?.kind === "ok" && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="write-ok">
          The agent accepted this call.
        </Typography>
      )}
      <ConfirmAction
        open={target !== undefined}
        title={`Revoke key ${target ?? ""}?`}
        confirmLabel="Revoke key"
        pending={revoke.pending}
        consequence={
          <>
            The key stops working. A second revoke 404s. If this fails without a
            clear answer, re-read the key rather than assuming it is dead.
          </>
        }
        onCancel={() => setTarget(undefined)}
        onConfirm={() => {
          const id = target;
          setTarget(undefined);
          if (id) {
            setRevoking(id);
            void revoke.run({ id });
          }
        }}
      />
    </Box>
  );
}

function KeyRows({
  id,
  label,
  role,
  active,
  open,
  pending,
  canRevoke,
  blockedHint,
  onLoad,
  onRevoke,
}: {
  id: string;
  label: string;
  role: string;
  active: boolean;
  open: boolean;
  pending: boolean;
  canRevoke: boolean;
  blockedHint: string | undefined;
  onLoad: () => void;
  onRevoke: () => void;
}) {
  return (
    <>
      <TableRow data-key-id={id}>
        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{id}</TableCell>
        <TableCell>{label || "—"}</TableCell>
        <TableCell>{role}</TableCell>
        <TableCell>
          <StatusChip status={active ? "active" : "inactive"} />
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
          <ReadForm label={open ? "Hide" : "Load"} action="fetch-key" onRun={onLoad} />{" "}
          <Hint hint={blockedHint}>
            <Button
              variant="outlined"
              size="small"
              data-action="revoke-key"
              disabled={!canRevoke || pending}
              onClick={onRevoke}
            >
              {pending ? "Working…" : "Revoke"}
            </Button>
          </Hint>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5}>
            <KeyDetail keyId={id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function KeyDetail({ keyId }: { keyId: string }) {
  const detail = useResource(`api-key:${keyId}`, (c, signal) => apiKeyById(c, keyId, signal));
  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result && detail.result.kind !== "ok" ? describe(detail.result) : "Loading…"}
      </Typography>
    );
  }
  const d = detail.data;
  return (
    <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
      {[
        d.name ? `name ${d.name}` : undefined,
        d.created_at ? `created ${d.created_at}` : undefined,
        d.expires_at ? `expires ${d.expires_at}` : undefined,
        d.last_used_at ? `last used ${d.last_used_at}` : undefined,
        d.use_count !== null ? `${d.use_count} uses` : undefined,
        `revoked ${String(d.revoked)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </Typography>
  );
}
