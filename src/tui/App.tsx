import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Box, Image, Input, Text } from "pixel-react";
import type { EngineInfo, NodeHandle, Rgba } from "pixel-react";
import { formatCost, formatDuration, formatPercent, formatTimecode, shortName } from "./format";
import { idlePeaks } from "./media";
import { playhead, queueCost, store, type Job } from "./store";
import { makeTheme, type Theme } from "./theme";

const BARS = 96;

export interface Fonts {
  ui: number;
  mono: number;
}

interface Ctx {
  theme: Theme;
  rem: number;
  fonts: Fonts;
  width: number;
}

export function App({ info, fonts }: { info: EngineInfo; fonts: Fonts }) {
  const snap = store.snapshot();
  const theme = useMemo(() => makeTheme(info.colors), [info.colors]);
  const rem = info.basePx;
  const ctx: Ctx = { theme, rem, fonts, width: info.width };
  const job = store.active();
  const showInspector = info.width > rem * 48;

  return (
    <Box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: theme.bg,
        color: theme.fg,
        fontSize: rem,
        font: fonts.ui,
      }}
    >
      <TopBar ctx={ctx} job={job} />
      <Hairline ctx={ctx} />
      <Box style={{ flexGrow: 1, flexBasis: 0, overflow: "hidden" }}>
        <QueueRail ctx={ctx} />
        <Stage ctx={ctx} job={job} />
        {showInspector && <Inspector ctx={ctx} job={job} />}
      </Box>
      <Hairline ctx={ctx} />
      <Composer ctx={ctx} />
      <Footer ctx={ctx} job={job} />
      {snap.mode === "palette" && <Palette ctx={ctx} />}
      {snap.mode === "settings" && <Settings ctx={ctx} />}
      {snap.mode === "setup" && <Setup ctx={ctx} />}
      {snap.toast && <Toast ctx={ctx} text={snap.toast} />}
    </Box>
  );
}

function Hairline({ ctx }: { ctx: Ctx }) {
  return (
    <Box
      style={{
        height: Math.max(ctx.rem / 16, 1),
        width: "100%",
        background: ctx.theme.hairline,
        flexShrink: 0,
      }}
    />
  );
}

function TopBar({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { theme, rem, fonts } = ctx;
  const snap = store.snapshot();
  const live = snap.jobs.some((row) => row.status === "running");
  return (
    <Box
      style={{
        alignItems: "center",
        justifyContent: "space-between",
        padding: { left: rem, right: rem, top: rem * 0.45, bottom: rem * 0.45 },
        gap: rem,
        flexShrink: 0,
      }}
    >
      <Box style={{ alignItems: "center", gap: rem * 0.6 }}>
        <Box
          style={{
            width: rem * 0.7,
            height: rem * 0.7,
            cornerRadius: 999,
            background: live ? theme.red : theme.accent,
            flexShrink: 0,
          }}
        />
        <Text style={{ fontSize: rem * 1.05, wrap: false }}>transcribe</Text>
        <Chip ctx={ctx} color={theme.muted}>
          studio
        </Chip>
      </Box>
      <Box style={{ alignItems: "center", gap: rem * 0.5 }}>
        {job && (
          <Text style={{ color: theme.muted, font: fonts.mono, fontSize: rem * 0.85, wrap: false }}>
            {job.message}
          </Text>
        )}
        <Chip ctx={ctx} color={live ? theme.red : theme.cyan}>
          {live ? "REC" : "IDLE"}
        </Chip>
        <Chip ctx={ctx} color={theme.yellow}>
          {formatCost(queueCost())}
        </Chip>
      </Box>
    </Box>
  );
}

function QueueRail({ ctx }: { ctx: Ctx }) {
  const { theme, rem } = ctx;
  const snap = store.snapshot();
  return (
    <Box
      style={{
        flexDirection: "column",
        width: rem * 16,
        flexShrink: 0,
        background: theme.sidebarBg,
        padding: rem * 0.45,
        gap: rem * 0.2,
        overflow: "scroll",
      }}
    >
      <Label ctx={ctx}>queue</Label>
      {snap.jobs.length === 0 && (
        <Text style={{ color: theme.muted, padding: rem * 0.4 }}>
          drop a path or paste a url
        </Text>
      )}
      {snap.jobs.map((job) => (
        <QueueItem key={job.id} ctx={ctx} job={job} />
      ))}
      {snap.history.length > 0 && (
        <Box style={{ flexDirection: "column", gap: rem * 0.2, margin: { top: rem * 0.6 } }}>
          <Label ctx={ctx}>recent</Label>
          {snap.history.slice(0, 8).map((entry) => (
            <Text
              key={`${entry.at}-${entry.input}`}
              style={{
                padding: { left: rem * 0.5, right: rem * 0.5, top: rem * 0.28, bottom: rem * 0.28 },
                color: theme.muted,
                hoverColor: theme.fg,
                hoverBackground: theme.itemHover,
                cornerRadius: rem * 0.35,
                wrap: false,
              }}
              onClick={() => store.enqueueRecent(entry)}
            >
              {entry.displayName}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function QueueItem({ ctx, job }: { ctx: Ctx; job: Job }) {
  const { theme, rem, fonts } = ctx;
  const active = store.snapshot().activeId === job.id;
  const color =
    job.status === "running"
      ? theme.accent
      : job.status === "done"
        ? theme.green
        : job.status === "error"
          ? theme.red
          : theme.muted;
  return (
    <Box
      style={{
        flexDirection: "column",
        gap: rem * 0.15,
        padding: rem * 0.45,
        cornerRadius: rem * 0.45,
        background: active ? theme.itemActive : undefined,
        hoverBackground: active ? undefined : theme.itemHover,
      }}
      onClick={() => store.select(job.id)}
    >
      <Box style={{ alignItems: "center", gap: rem * 0.4 }}>
        <Box
          style={{
            width: rem * 0.45,
            height: rem * 0.45,
            cornerRadius: 999,
            background: color,
            flexShrink: 0,
          }}
        />
        <Text style={{ flexGrow: 1, flexBasis: 0, wrap: false }}>{job.displayName}</Text>
      </Box>
      <Box style={{ alignItems: "center", gap: rem * 0.4 }}>
        <Meter ctx={ctx} value={job.percent / 100} color={color} />
        <Text style={{ color: theme.muted, font: fonts.mono, fontSize: rem * 0.75, wrap: false }}>
          {formatPercent(job.percent)}
        </Text>
      </Box>
    </Box>
  );
}

function Stage({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { rem } = ctx;
  return (
    <Box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        overflow: "hidden",
        padding: rem * 0.75,
        gap: rem * 0.6,
      }}
    >
      <Waveform ctx={ctx} job={job} />
      {job && job.chunks.length > 1 && <ChunkStrip ctx={ctx} job={job} />}
      <CaptionWell ctx={ctx} job={job} />
    </Box>
  );
}

function Waveform({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { theme, rem } = ctx;
  const snap = store.snapshot();
  const peaks = job && job.peaks.length ? job.peaks : idlePeaks(BARS, snap.frame);
  const head = playhead(job);
  const live = job?.status === "running";
  return (
    <Box
      style={{
        flexDirection: "column",
        background: theme.bgAlt,
        cornerRadius: rem * 0.7,
        padding: rem * 0.7,
        gap: rem * 0.45,
        flexShrink: 0,
        border: { width: Math.max(rem / 18, 1), color: live ? theme.accentDim : theme.hairline },
      }}
    >
      <Box style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.muted, fontSize: rem * 0.8, wrap: false }}>
          {job ? job.displayName : "awaiting input"}
        </Text>
        <Text style={{ color: theme.muted, font: ctx.fonts.mono, fontSize: rem * 0.8, wrap: false }}>
          {formatDuration(job?.duration)} · {formatPercent(head * 100)}
        </Text>
      </Box>
      <Box style={{ alignItems: "end", height: rem * 5.4, gap: 2 }}>
        {peaks.map((peak, i) => {
          const on = i / peaks.length <= head;
          const h = Math.max(2, peak * rem * 5);
          return (
            <Box
              key={i}
              style={{
                width: 3,
                height: h,
                cornerRadius: 2,
                background: on ? theme.waveOn : theme.waveOff,
                flexGrow: 1,
                flexBasis: 0,
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function ChunkStrip({ ctx, job }: { ctx: Ctx; job: Job }) {
  const { theme, rem, fonts } = ctx;
  return (
    <Box style={{ gap: rem * 0.25, flexShrink: 0 }}>
      {job.chunks.map((status, i) => {
        const color =
          status === "running"
            ? theme.accent
            : status === "done"
              ? theme.green
              : status === "error"
                ? theme.red
                : theme.hairline;
        return (
          <Box
            key={i}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              height: rem * 1.35,
              cornerRadius: rem * 0.3,
              background: status === "pending" ? theme.chipBg : color,
              justifyContent: "center",
              alignItems: "center",
              border: { width: 1, color },
            }}
          >
            <Text
              style={{
                font: fonts.mono,
                fontSize: rem * 0.7,
                color: status === "pending" ? theme.muted : theme.fg,
                wrap: false,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function CaptionWell({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { theme, rem, fonts } = ctx;
  const list = useRef<NodeHandle | null>(null);
  const cues = job?.cues ?? [];
  const current = cues.length ? cues[cues.length - 1] : null;
  useEffect(() => {
    list.current?.scrollTo(1e9, true);
  }, [cues.length]);

  return (
    <Box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        overflow: "hidden",
        background: theme.bgAlt,
        cornerRadius: rem * 0.7,
        border: { width: Math.max(rem / 18, 1), color: theme.hairline },
      }}
    >
      <Box
        style={{
          padding: rem * 0.7,
          border: { bottom: [1, theme.hairline] },
          flexShrink: 0,
          height: rem * 3.6,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: rem * 1.15,
            color: current ? theme.fg : theme.muted,
          }}
        >
          {current ? current.text : "captions will land here as whisper returns chunks"}
        </Text>
      </Box>
      <Box
        ref={list}
        style={{
          flexDirection: "column",
          flexGrow: 1,
          flexBasis: 0,
          overflow: "scroll",
          padding: rem * 0.5,
          gap: rem * 0.2,
          selectionMode: "unified",
        }}
      >
        {cues.map((cue, i) => {
          const active = i === cues.length - 1 && job?.status === "running";
          return (
            <Box
              key={`${cue.start}-${i}`}
              style={{
                gap: rem * 0.6,
                padding: { left: rem * 0.4, right: rem * 0.4, top: rem * 0.25, bottom: rem * 0.25 },
                cornerRadius: rem * 0.35,
                background: active ? theme.itemActive : undefined,
                alignItems: "start",
              }}
            >
              <Text
                style={{
                  color: theme.cyan,
                  font: fonts.mono,
                  fontSize: rem * 0.8,
                  flexShrink: 0,
                  wrap: false,
                }}
              >
                {formatTimecode(cue.start)}
              </Text>
              <Text style={{ flexGrow: 1, color: active ? theme.fg : theme.muted }}>{cue.text}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function Inspector({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { theme, rem, fonts } = ctx;
  const snap = store.snapshot();
  return (
    <Box
      style={{
        flexDirection: "column",
        width: rem * 16.5,
        flexShrink: 0,
        padding: rem * 0.6,
        gap: rem * 0.45,
        background: theme.sidebarBg,
        overflow: "scroll",
        border: { left: [1, theme.hairline] },
      }}
    >
      <Label ctx={ctx}>inspector</Label>
      {job?.poster && (
        <Image
          src={job.poster}
          style={{
            width: "100%",
            cornerRadius: rem * 0.5,
            overflow: "hidden",
          }}
          placeholder={
            <Box
              style={{
                width: "100%",
                height: rem * 4,
                background: theme.chipBg,
                cornerRadius: rem * 0.5,
              }}
            />
          }
          error={
            <Box
              style={{
                width: "100%",
                height: rem * 4,
                background: theme.chipBg,
                cornerRadius: rem * 0.5,
              }}
            />
          }
        />
      )}
      <Fact ctx={ctx} k="file" v={job ? job.displayName : "—"} />
      <Fact ctx={ctx} k="phase" v={job?.phase ?? "idle"} />
      <Fact ctx={ctx} k="language" v={job?.language ?? "—"} />
      <Fact ctx={ctx} k="duration" v={formatDuration(job?.duration)} />
      <Fact ctx={ctx} k="cost" v={formatCost(job?.costUsd ?? 0)} />
      <Fact ctx={ctx} k="cues" v={String(job?.cues.length ?? 0)} />
      <Fact ctx={ctx} k="audio" v={snap.run.useRaw ? "raw" : "optimized"} />
      <Fact ctx={ctx} k="chunks" v={`${snap.run.chunkMinutes ?? 20} min`} />
      {job?.srtPath && (
        <Text
          style={{
            color: theme.accent,
            font: fonts.mono,
            fontSize: rem * 0.75,
            hoverColor: theme.fg,
          }}
          onClick={() => job.srtPath && store.commands().find((c) => c.id === "reveal")?.run()}
        >
          {shortName(job.srtPath)}
        </Text>
      )}
      {job?.error && (
        <Text style={{ color: theme.red, fontSize: rem * 0.85 }}>{job.error}</Text>
      )}
    </Box>
  );
}

function Composer({ ctx }: { ctx: Ctx }) {
  const { theme, rem, fonts } = ctx;
  const snap = store.snapshot();
  const input = useRef<NodeHandle | null>(null);
  const locked = snap.mode !== "studio";
  return (
    <Box
      style={{
        alignItems: "center",
        padding: { left: rem * 0.8, right: rem * 0.8, top: rem * 0.45, bottom: rem * 0.45 },
        gap: rem * 0.6,
        flexShrink: 0,
      }}
    >
      <Text style={{ color: theme.accent, font: fonts.mono, flexShrink: 0 }}>❯</Text>
      <Input
        ref={input}
        value={snap.composer}
        autoFocus={!locked}
        caretColor={theme.accent}
        selectionColor={theme.selection}
        style={{ flexGrow: 1, flexBasis: 0 }}
        onChange={(text) => store.setComposer(text)}
        onSubmit={() => store.submitComposer()}
      />
      <Chip ctx={ctx} color={theme.accent} onClick={() => store.startSelected()}>
        start
      </Chip>
    </Box>
  );
}

function Footer({ ctx, job }: { ctx: Ctx; job: Job | null }) {
  const { theme, rem, fonts } = ctx;
  const snap = store.snapshot();
  const running = snap.jobs.filter((row) => row.status === "running").length;
  const queued = snap.jobs.filter((row) => row.status === "queued").length;
  return (
    <Box
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        padding: { left: rem * 0.8, right: rem * 0.8, top: rem * 0.3, bottom: rem * 0.4 },
        flexShrink: 0,
      }}
    >
      <Text style={{ color: theme.muted, font: fonts.mono, fontSize: rem * 0.75, wrap: false }}>
        ctrl+k palette · enter start · j/k queue · c copy · o open · ctrl+q quit
      </Text>
      <Text style={{ color: theme.muted, font: fonts.mono, fontSize: rem * 0.75, wrap: false }}>
        {running} live · {queued} queued · {job?.cues.length ?? 0} cues
      </Text>
    </Box>
  );
}

function Palette({ ctx }: { ctx: Ctx }) {
  const { theme, rem, fonts } = ctx;
  const snap = store.snapshot();
  const cmds = store.filteredCommands();
  return (
    <Scrim ctx={ctx}>
      <Box
        style={{
          flexDirection: "column",
          width: rem * 28,
          background: theme.bgAlt,
          cornerRadius: rem * 0.7,
          border: { width: 1, color: theme.accent },
          overflow: "hidden",
        }}
        onClickOutside={() => store.closeOverlay()}
      >
        <Box style={{ alignItems: "center", padding: rem * 0.7, gap: rem * 0.5 }}>
          <Text style={{ color: theme.accent, font: fonts.mono }}>/</Text>
          <Input
            value={snap.paletteQuery}
            autoFocus
            caretColor={theme.accent}
            selectionColor={theme.selection}
            style={{ flexGrow: 1 }}
            onChange={(text) => store.setPaletteQuery(text)}
            onSubmit={() => store.runPalette()}
          />
        </Box>
        <Hairline ctx={ctx} />
        <Box style={{ flexDirection: "column", padding: rem * 0.35, gap: rem * 0.1 }}>
          {cmds.map((cmd, i) => {
            const active = i === snap.paletteIndex;
            return (
              <Box
                key={cmd.id}
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: rem * 0.4,
                  cornerRadius: rem * 0.35,
                  background: active ? theme.itemActive : undefined,
                  hoverBackground: active ? undefined : theme.itemHover,
                }}
                onClick={() => store.palettePick(i)}
              >
                <Text>{cmd.label}</Text>
                {cmd.hint ? (
                  <Text style={{ color: theme.muted, font: fonts.mono, fontSize: rem * 0.75 }}>
                    {cmd.hint}
                  </Text>
                ) : null}
              </Box>
            );
          })}
          {cmds.length === 0 && (
            <Text style={{ color: theme.muted, padding: rem * 0.5 }}>no matches</Text>
          )}
        </Box>
      </Box>
    </Scrim>
  );
}

function Settings({ ctx }: { ctx: Ctx }) {
  const { theme, rem } = ctx;
  const snap = store.snapshot();
  return (
    <Scrim ctx={ctx}>
      <Box
        style={{
          flexDirection: "column",
          width: rem * 26,
          background: theme.bgAlt,
          cornerRadius: rem * 0.7,
          border: { width: 1, color: theme.hairline },
          padding: rem * 0.9,
          gap: rem * 0.55,
        }}
        onClickOutside={() => store.closeOverlay()}
      >
        <Text style={{ fontSize: rem * 1.1 }}>settings</Text>
        <RowToggle
          ctx={ctx}
          label="audio"
          value={snap.run.useRaw ? "raw" : "optimized 1.2x"}
          onClick={() => store.toggleRaw()}
        />
        <RowToggle
          ctx={ctx}
          label="chunks"
          value={`${snap.run.chunkMinutes ?? 20} min`}
          onClick={() => store.cycleChunks()}
        />
        <Text style={{ color: theme.muted, fontSize: rem * 0.8 }}>
          cookies-from-browser is set from the CLI flag. API key lives in ~/.transcribe/config.json
        </Text>
        <Chip ctx={ctx} color={theme.accent} onClick={() => store.closeOverlay()}>
          close
        </Chip>
      </Box>
    </Scrim>
  );
}

function Setup({ ctx }: { ctx: Ctx }) {
  const { theme, rem, fonts } = ctx;
  return (
    <Scrim ctx={ctx}>
      <Box
        style={{
          flexDirection: "column",
          width: rem * 30,
          background: theme.bgAlt,
          cornerRadius: rem * 0.8,
          border: { width: 1, color: theme.accent },
          padding: rem * 1.1,
          gap: rem * 0.7,
        }}
      >
        <Text style={{ fontSize: rem * 1.3 }}>unlock whisper</Text>
        <Text style={{ color: theme.muted }}>
          paste an OpenAI API key. it is stored in ~/.transcribe/config.json and never printed back.
        </Text>
        <Box
          style={{
            alignItems: "center",
            padding: rem * 0.5,
            background: theme.chipBg,
            cornerRadius: rem * 0.4,
            gap: rem * 0.4,
          }}
        >
          <Text style={{ color: theme.accent, font: fonts.mono }}>sk-</Text>
          <Input
            autoFocus
            caretColor={theme.accent}
            selectionColor={theme.selection}
            style={{ flexGrow: 1 }}
            onSubmit={(text) => store.saveApiKey(text)}
          />
        </Box>
        <Text style={{ color: theme.muted, fontSize: rem * 0.8 }}>
          enter saves · get a key at platform.openai.com/api-keys
        </Text>
      </Box>
    </Scrim>
  );
}

function Toast({ ctx, text }: { ctx: Ctx; text: string }) {
  const { theme, rem } = ctx;
  return (
    <Box
      style={{
        position: "absolute",
        inset: { left: rem, bottom: rem * 3.4 },
        padding: { left: rem * 0.7, right: rem * 0.7, top: rem * 0.35, bottom: rem * 0.35 },
        background: theme.itemActive,
        cornerRadius: rem * 0.4,
        border: { width: 1, color: theme.accent },
      }}
    >
      <Text style={{ wrap: false }}>{text}</Text>
    </Box>
  );
}

function Scrim({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  const { theme } = ctx;
  return (
    <Box
      style={{
        position: "absolute",
        inset: { left: 0, right: 0, top: 0, bottom: 0 },
        background: theme.overlay,
        justifyContent: "center",
        alignItems: "center",
      }}
      onClick={() => store.closeOverlay()}
    >
      {children}
    </Box>
  );
}

function Chip({
  ctx,
  color,
  children,
  onClick,
}: {
  ctx: Ctx;
  color: Rgba;
  children: string;
  onClick?: () => void;
}) {
  const { theme, rem, fonts } = ctx;
  return (
    <Text
      style={{
        padding: { left: rem * 0.55, right: rem * 0.55, top: rem * 0.12, bottom: rem * 0.12 },
        cornerRadius: 999,
        background: theme.chipBg,
        color,
        fontSize: rem * 0.78,
        font: fonts.mono,
        flexShrink: 0,
        wrap: false,
        hoverBackground: onClick ? theme.itemHover : undefined,
      }}
      onClick={onClick}
    >
      {children}
    </Text>
  );
}

function Label({ ctx, children }: { ctx: Ctx; children: string }) {
  const { theme, rem, fonts } = ctx;
  return (
    <Text
      style={{
        color: theme.muted,
        font: fonts.mono,
        fontSize: rem * 0.72,
        padding: { left: rem * 0.4, top: rem * 0.2, bottom: rem * 0.2 },
        wrap: false,
      }}
    >
      {children}
    </Text>
  );
}

function Fact({ ctx, k, v }: { ctx: Ctx; k: string; v: string }) {
  const { theme, rem, fonts } = ctx;
  return (
    <Box style={{ justifyContent: "space-between", gap: rem * 0.5 }}>
      <Text style={{ color: theme.muted, fontSize: rem * 0.8, wrap: false }}>{k}</Text>
      <Text style={{ font: fonts.mono, fontSize: rem * 0.8, wrap: false }}>{v}</Text>
    </Box>
  );
}

function Meter({ ctx, value, color }: { ctx: Ctx; value: number; color: Rgba }) {
  const { theme, rem } = ctx;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <Box
      style={{
        flexGrow: 1,
        height: rem * 0.28,
        background: theme.chipBg,
        cornerRadius: 99,
        overflow: "hidden",
      }}
    >
      <Box
        style={{
          width: `${Math.round(pct * 100)}%` as `${number}%`,
          height: "100%",
          background: color,
        }}
      />
    </Box>
  );
}

function RowToggle({
  ctx,
  label,
  value,
  onClick,
}: {
  ctx: Ctx;
  label: string;
  value: string;
  onClick: () => void;
}) {
  const { theme, rem } = ctx;
  return (
    <Box
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        padding: rem * 0.45,
        cornerRadius: rem * 0.4,
        background: theme.chipBg,
        hoverBackground: theme.itemHover,
      }}
      onClick={onClick}
    >
      <Text>{label}</Text>
      <Text style={{ color: theme.accent }}>{value}</Text>
    </Box>
  );
}
