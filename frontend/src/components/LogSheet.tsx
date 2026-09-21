import { useMemo } from "react";
import type { DutyStatus, LogDay, TripInputs } from "../types";

/**
 * A driver's daily log, drawn to match the printed DOT log book: a 24-hour
 * graph grid over the four duty-status rows, quarter-hour tick marks, a totals
 * column, a remarks ruler naming the place of every change of duty status, the
 * shipping document block, and the end-of-day recap.
 *
 * Field layout and wording follow the standard log book form; the required
 * contents are set out in 49 CFR 395.8(d).
 */

const VIEW_WIDTH = 1100;
const VIEW_HEIGHT = 772;

const GRID_LEFT = 150;
const HOUR_WIDTH = 36;
const GRID_WIDTH = 24 * HOUR_WIDTH;
const GRID_RIGHT = GRID_LEFT + GRID_WIDTH;

const TOTALS_WIDTH = 62;
const TOTALS_CENTRE = GRID_RIGHT + TOTALS_WIDTH / 2;

const SCALE_HEIGHT = 28;
const ROW_HEIGHT = 27;
const GRID_TOP = 300;
const GRID_BOTTOM = GRID_TOP + 4 * ROW_HEIGHT;

const REMARKS_TOP = GRID_BOTTOM + 30;
const REMARKS_HEIGHT = 26;

const SHIPPING_TOP = 508;
const RECAP_TOP = 636;
const RECAP_HEIGHT = 118;

const ROWS: { status: DutyStatus; line: number; label: string[] }[] = [
  { status: "off_duty", line: 1, label: ["Off Duty"] },
  { status: "sleeper_berth", line: 2, label: ["Sleeper", "Berth"] },
  { status: "driving", line: 3, label: ["Driving"] },
  { status: "on_duty", line: 4, label: ["On Duty", "(not driving)"] },
];

/** The printed log book runs 12-hour clock labels either side of Noon. */
const HOUR_LABELS = [
  "Mid-\nnight", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  "Noon", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
];

const x = (minute: number) => GRID_LEFT + (minute / 60) * HOUR_WIDTH;
const rowCentre = (index: number) => GRID_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;

function hours(value: number): string {
  if (!value) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

function minutesToClock(minute: number): string {
  const clamped = Math.min(minute, 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(
    clamped % 60,
  ).padStart(2, "0")}`;
}

interface Props {
  day: LogDay;
  dayNumber: number;
  totalDays: number;
  inputs: TripInputs;
  carrier?: string;
  driver?: string;
  shippingNumber?: string;
  highlightSegment?: number | null;
  onHoverSegment?: (index: number | null) => void;
}

export function LogSheet({
  day,
  dayNumber,
  totalDays,
  inputs,
  carrier = "Spotter AI Logistics",
  driver = "—",
  shippingNumber = "—",
  highlightSegment,
  onHoverSegment,
}: Props) {
  const [year, month, dayOfMonth] = day.date.split("-");

  const rowIndexByStatus = useMemo(() => {
    const map = new Map<DutyStatus, number>();
    ROWS.forEach((row, index) => map.set(row.status, index));
    return map;
  }, []);

  /** Where this sheet's day began and ended, for the From/To fields. */
  const { from, to } = useMemo(() => {
    const named = day.entries.filter((entry) => entry.location);
    return {
      from: named[0]?.location || inputs.current_location,
      to: named[named.length - 1]?.location || inputs.dropoff_location,
    };
  }, [day.entries, inputs.current_location, inputs.dropoff_location]);

  /** Vertical connectors between consecutive duty statuses. */
  const connectors = useMemo(() => {
    const lines: { x: number; y1: number; y2: number }[] = [];
    for (let i = 0; i < day.entries.length - 1; i += 1) {
      const from = day.entries[i];
      const to = day.entries[i + 1];
      if (from.status === to.status) continue;
      lines.push({
        x: x(to.start_minute),
        y1: rowCentre(rowIndexByStatus.get(from.status) ?? 0),
        y2: rowCentre(rowIndexByStatus.get(to.status) ?? 0),
      });
    }
    return lines;
  }, [day.entries, rowIndexByStatus]);

  const rolling = day.rolling_on_duty ?? {};
  const onDutyToday = day.total_on_duty_hours;

  return (
    <svg
      className="logsheet"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`Driver's daily log for ${day.date}, sheet ${dayNumber} of ${totalDays}`}
    >
      <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#ffffff" />

      {/* ======================= header ======================= */}
      <text x={24} y={32} className="ls-title">Drivers Daily Log</text>
      <text x={48} y={48} className="ls-caption">(24 hours)</text>

      <RuledField x={300} y={34} width={82} value={month} caption="(month)" />
      <text x={392} y={34} className="ls-slash">/</text>
      <RuledField x={404} y={34} width={72} value={dayOfMonth} caption="(day)" />
      <text x={486} y={34} className="ls-slash">/</text>
      <RuledField x={498} y={34} width={82} value={year} caption="(year)" />

      <text x={640} y={22} className="ls-fine">Original - File at home terminal.</text>
      <text x={640} y={36} className="ls-fine">
        Duplicate - Driver retains in his/her possession for 8 days.
      </text>
      <text x={VIEW_WIDTH - 24} y={56} className="ls-sheet-no" textAnchor="end">
        SHEET {dayNumber} OF {totalDays}
      </text>

      <text x={24} y={76} className="ls-label">From:</text>
      <RuledField x={70} y={78} width={300} value={from} />
      <text x={430} y={76} className="ls-label">To:</text>
      <RuledField x={466} y={78} width={320} value={to} />

      {/* Two boxed mileage figures, then the vehicle box beneath them. */}
      <BoxedField
        x={46} y={100} width={176} height={34}
        value={day.miles_driven.toFixed(0)}
        caption="Total Miles Driving Today"
      />
      <BoxedField
        x={236} y={100} width={176} height={34}
        value={day.miles_driven.toFixed(0)}
        caption="Total Mileage Today"
      />
      <BoxedField
        x={46} y={156} width={366} height={34}
        value="—"
        caption="Truck/Tractor and Trailer Numbers or"
        caption2="License Plate(s)/State (show each unit)"
      />

      <RuledField x={470} y={96} width={380} value={carrier}
        caption="Name of Carrier or Carriers" centred />
      <RuledField x={470} y={142} width={380} value={inputs.current_location}
        caption="Main Office Address" centred />
      <RuledField x={470} y={188} width={380} value={inputs.current_location}
        caption="Home Terminal Address" centred />

      {/* 395.8(d): certification and co-driver are required on every page. */}
      <RuledField x={46} y={240} width={366} value="—"
        caption="Name of Co-Driver" centred />
      <text x={660} y={222} className="ls-fine" textAnchor="middle">
        I certify that these entries are true and correct
      </text>
      <RuledField x={470} y={240} width={380} value={driver}
        caption="Driver's Signature in Full" centred />

      <text x={GRID_LEFT} y={GRID_TOP - SCALE_HEIGHT - 10} className="ls-fine">
        Use time standard of home terminal — 24-hour period starts at midnight.
      </text>

      {/* ======================= grid ======================= */}
      {/* Black scale bar, as printed on the log book. */}
      <rect
        x={GRID_LEFT} y={GRID_TOP - SCALE_HEIGHT}
        width={GRID_WIDTH + TOTALS_WIDTH} height={SCALE_HEIGHT}
        fill="#111827"
      />
      {HOUR_LABELS.map((label, hour) => {
        const parts = label.split("\n");
        const cx = x(hour * 60) + (hour === 0 ? 14 : 0);
        return (
          <g key={`scale-${hour}`}>
            {parts.map((part, line) => (
              <text
                key={part + line}
                x={cx}
                y={
                  GRID_TOP - SCALE_HEIGHT +
                  (parts.length > 1 ? 12 + line * 10 : 18)
                }
                className="ls-scale"
                textAnchor="middle"
              >
                {part}
              </text>
            ))}
          </g>
        );
      })}
      <text x={GRID_RIGHT - 14} y={GRID_TOP - SCALE_HEIGHT + 12} className="ls-scale"
        textAnchor="middle">Mid-</text>
      <text x={GRID_RIGHT - 14} y={GRID_TOP - SCALE_HEIGHT + 22} className="ls-scale"
        textAnchor="middle">night</text>
      <text x={TOTALS_CENTRE} y={GRID_TOP - SCALE_HEIGHT + 12} className="ls-scale"
        textAnchor="middle">Total</text>
      <text x={TOTALS_CENTRE} y={GRID_TOP - SCALE_HEIGHT + 22} className="ls-scale"
        textAnchor="middle">Hours</text>

      <g className="ls-grid">
        {ROWS.map((row, index) => (
          <rect
            key={row.status}
            x={GRID_LEFT} y={GRID_TOP + index * ROW_HEIGHT}
            width={GRID_WIDTH} height={ROW_HEIGHT}
            fill="#ffffff" stroke="#111827" strokeWidth={0.9}
          />
        ))}

        {/* quarter-hour ticks inside every row */}
        {ROWS.map((row, rowIndex) =>
          Array.from({ length: 24 }).flatMap((_, hour) =>
            [1, 2, 3].map((quarter) => {
              const top = GRID_TOP + rowIndex * ROW_HEIGHT;
              const depth = quarter === 2 ? ROW_HEIGHT * 0.58 : ROW_HEIGHT * 0.34;
              const tickX = x(hour * 60 + quarter * 15);
              return (
                <line
                  key={`${row.status}-${hour}-${quarter}`}
                  x1={tickX} y1={top} x2={tickX} y2={top + depth}
                  stroke="#374151" strokeWidth={0.55}
                />
              );
            }),
          ),
        )}

        {Array.from({ length: 25 }).map((_, hour) => (
          <line
            key={`hour-${hour}`}
            x1={x(hour * 60)} y1={GRID_TOP} x2={x(hour * 60)} y2={GRID_BOTTOM}
            stroke="#111827" strokeWidth={hour % 6 === 0 ? 1.1 : 0.7}
          />
        ))}

        {/* totals column */}
        <rect
          x={GRID_RIGHT} y={GRID_TOP}
          width={TOTALS_WIDTH} height={4 * ROW_HEIGHT}
          fill="#ffffff" stroke="#111827" strokeWidth={0.9}
        />
        {ROWS.map((_, index) => (
          <line
            key={`total-sep-${index}`}
            x1={GRID_RIGHT} y1={GRID_TOP + index * ROW_HEIGHT}
            x2={GRID_RIGHT + TOTALS_WIDTH} y2={GRID_TOP + index * ROW_HEIGHT}
            stroke="#111827" strokeWidth={0.7}
          />
        ))}

        {ROWS.map((row, index) => (
          <g key={`label-${row.status}`}>
            <text x={GRID_LEFT - 10} y={rowCentre(index) + (row.label[1] ? -1 : 3)}
              className="ls-rowlabel" textAnchor="end">
              {row.line}. {row.label[0]}
            </text>
            {row.label[1] && (
              <text x={GRID_LEFT - 10} y={rowCentre(index) + 10}
                className="ls-rowlabel" textAnchor="end">
                {row.label[1]}
              </text>
            )}
          </g>
        ))}
      </g>

      {/* ============== the drawn duty line ============== */}
      <g className="ls-duty">
        {connectors.map((line, index) => (
          <line
            key={`connector-${index}`}
            x1={line.x} y1={line.y1} x2={line.x} y2={line.y2}
            className="ls-duty-line"
          />
        ))}
        {day.entries.map((entry, index) => {
          const rowIndex = rowIndexByStatus.get(entry.status) ?? 0;
          const active =
            highlightSegment != null && entry.segment_index === highlightSegment;
          return (
            <line
              key={`entry-${index}`}
              x1={x(entry.start_minute)} y1={rowCentre(rowIndex)}
              x2={x(entry.end_minute)} y2={rowCentre(rowIndex)}
              className={`ls-duty-line${active ? " is-active" : ""}`}
              onMouseEnter={() => onHoverSegment?.(entry.segment_index)}
              onMouseLeave={() => onHoverSegment?.(null)}
            >
              <title>
                {`${entry.label} · ${minutesToClock(entry.start_minute)}–${minutesToClock(
                  entry.end_minute,
                )}${entry.location ? ` · ${entry.location}` : ""}`}
              </title>
            </line>
          );
        })}
      </g>

      {ROWS.map((row, index) => (
        <text
          key={`total-${row.status}`}
          x={TOTALS_CENTRE} y={rowCentre(index) + 5}
          className="ls-total" textAnchor="middle"
        >
          {hours(day.totals[row.status] ?? 0)}
        </text>
      ))}
      <text
        x={TOTALS_CENTRE} y={GRID_BOTTOM + 19}
        className={`ls-total ls-total-sum${day.balanced ? "" : " is-bad"}`}
        textAnchor="middle"
      >
        = {hours(Object.values(day.totals).reduce((a, b) => a + b, 0))}
      </text>

      {/* ======================= remarks ======================= */}
      <text x={24} y={REMARKS_TOP + 2} className="ls-label">Remarks</text>
      <line
        x1={24} y1={REMARKS_TOP + 10} x2={24} y2={RECAP_TOP - 8}
        stroke="#111827" strokeWidth={1}
      />
      <rect
        x={GRID_LEFT} y={REMARKS_TOP} width={GRID_WIDTH} height={REMARKS_HEIGHT}
        fill="#ffffff" stroke="#111827" strokeWidth={0.9}
      />
      {Array.from({ length: 24 }).flatMap((_, hour) =>
        [1, 2, 3].map((quarter) => {
          const tickX = x(hour * 60 + quarter * 15);
          return (
            <line
              key={`rtick-${hour}-${quarter}`}
              x1={tickX} y1={REMARKS_TOP}
              x2={tickX} y2={REMARKS_TOP + REMARKS_HEIGHT * 0.34}
              stroke="#374151" strokeWidth={0.55}
            />
          );
        }),
      )}
      {Array.from({ length: 25 }).map((_, hour) => (
        <line
          key={`rhour-${hour}`}
          x1={x(hour * 60)} y1={REMARKS_TOP}
          x2={x(hour * 60)} y2={REMARKS_TOP + REMARKS_HEIGHT}
          stroke="#111827" strokeWidth={hour % 6 === 0 ? 1.1 : 0.7}
        />
      ))}

      {day.remarks.map((remark, index) => {
        const markX = x(remark.minute);
        const previous = day.remarks[index - 1];
        // Stops close together would print on top of each other.
        const crowded = previous !== undefined && markX - x(previous.minute) < 34;
        const drop = crowded ? 13 : 0;
        const labelY = REMARKS_TOP + REMARKS_HEIGHT + 12 + drop;
        return (
          <g key={`remark-${index}`}>
            <line
              x1={markX} y1={REMARKS_TOP}
              x2={markX} y2={REMARKS_TOP + REMARKS_HEIGHT + 6 + drop}
              stroke="#1d4ed8" strokeWidth={1.2}
            />
            <text
              x={markX + 4} y={labelY}
              transform={`rotate(58 ${markX + 4} ${labelY})`}
              className="ls-remark-text"
            >
              {remark.location || remark.note}
            </text>
          </g>
        );
      })}

      {/* ================ shipping documents ================ */}
      <text x={32} y={SHIPPING_TOP} className="ls-label">Shipping</text>
      <text x={32} y={SHIPPING_TOP + 14} className="ls-label">Documents:</text>

      <RuledField
        x={32} y={SHIPPING_TOP + 48} width={190}
        value={shippingNumber} caption="DVL or Manifest No." small
      />
      <text x={32} y={SHIPPING_TOP + 74} className="ls-caption">or</text>
      <RuledField
        x={32} y={SHIPPING_TOP + 104} width={190}
        value={inputs.pickup_location} caption="Shipper &amp; Commodity" small
      />

      <text x={280} y={SHIPPING_TOP + 96} className="ls-fine">
        Enter name of place you reported and where released from work and when and
        where each change of duty occurred.
      </text>
      <text x={330} y={SHIPPING_TOP + 110} className="ls-fine">
        Use time standard of home terminal.
      </text>

      {/* ======================= recap ======================= */}
      <Recap
        onDutyToday={onDutyToday}
        cycleLimit={inputs.cycle_limit_hours}
        last5={rolling["5"] ?? 0}
        last7={rolling["7"] ?? 0}
        last8={rolling["8"] ?? 0}
      />
    </svg>
  );
}

/**
 * End-of-day recap. Both cycles are shown because the printed form carries
 * both; the one the driver is actually running is highlighted.
 *
 * 70/8: A is on-duty hours over the last 8 days, B is what 70 leaves, C is the
 * last 7 days. 60/7: A is the last 7 days, B is what 60 leaves, C is the last 5.
 */
function Recap({
  onDutyToday,
  cycleLimit,
  last5,
  last7,
  last8,
}: {
  onDutyToday: number;
  cycleLimit: number;
  last5: number;
  last7: number;
  last8: number;
}) {
  const groups = [
    {
      title: "70 Hour / 8 Day Drivers",
      active: cycleLimit === 70,
      cells: [
        { key: "A.", label: "Total hours on duty last 8 days including today", value: last8 },
        { key: "B.", label: "Total hours available tomorrow, 70 hr. minus A*", value: Math.max(0, 70 - last8) },
        { key: "C.", label: "Total hours on duty last 7 days including today", value: last7 },
      ],
    },
    {
      title: "60 Hour / 7 Day Drivers",
      active: cycleLimit === 60,
      cells: [
        { key: "A.", label: "Total hours on duty last 7 days including today", value: last7 },
        { key: "B.", label: "Total hours available tomorrow, 60 hr. minus A*", value: Math.max(0, 60 - last7) },
        { key: "C.", label: "Total hours on duty last 5 days including today", value: last5 },
      ],
    },
  ];

  const CELL_W = 122;
  const groupX = [232, 610];

  return (
    <g className="ls-recap">
      <rect
        x={24} y={RECAP_TOP} width={VIEW_WIDTH - 48} height={RECAP_HEIGHT}
        fill="#ffffff" stroke="#111827" strokeWidth={0.9}
      />

      <text x={34} y={RECAP_TOP + 18} className="ls-label">Recap:</text>
      <text x={34} y={RECAP_TOP + 32} className="ls-caption">Complete at</text>
      <text x={34} y={RECAP_TOP + 44} className="ls-caption">end of day</text>

      {/* On-duty hours today — lines 3 and 4 of the grid. */}
      <rect
        x={112} y={RECAP_TOP + 8} width={106} height={RECAP_HEIGHT - 16}
        fill="#f6f8fc" stroke="#111827" strokeWidth={0.7}
      />
      <text x={120} y={RECAP_TOP + 24} className="ls-caption">On duty hours</text>
      <text x={120} y={RECAP_TOP + 36} className="ls-caption">today, Total</text>
      <text x={120} y={RECAP_TOP + 48} className="ls-caption">lines 3 &amp; 4</text>
      <text x={165} y={RECAP_TOP + 86} className="ls-recap-value" textAnchor="middle">
        {hours(onDutyToday)}
      </text>

      {groups.map((group, groupIndex) => (
        <g key={group.title}>
          <text
            x={groupX[groupIndex]} y={RECAP_TOP + 20}
            className={`ls-caption${group.active ? " is-active" : ""}`}
          >
            {group.title}
          </text>
          {group.cells.map((cell, cellIndex) => {
            const cellX = groupX[groupIndex] + cellIndex * CELL_W;
            return (
              <g key={cell.key}>
                <rect
                  x={cellX} y={RECAP_TOP + 28}
                  width={CELL_W - 8} height={RECAP_HEIGHT - 38}
                  fill={group.active ? "#f6f8fc" : "#ffffff"}
                  stroke="#111827" strokeWidth={0.7}
                />
                <text x={cellX + 6} y={RECAP_TOP + 42} className="ls-caption">
                  {cell.key}
                </text>
                <WrappedCaption
                  x={cellX + 6} y={RECAP_TOP + 54} width={CELL_W - 20}
                  text={cell.label}
                />
                <text
                  x={cellX + CELL_W - 16} y={RECAP_TOP + RECAP_HEIGHT - 18}
                  className="ls-recap-value" textAnchor="end"
                >
                  {hours(cell.value)}
                </text>
              </g>
            );
          })}
        </g>
      ))}

      <text x={VIEW_WIDTH - 148} y={RECAP_TOP + 20} className="ls-caption">
        *If you took 34
      </text>
      <text x={VIEW_WIDTH - 148} y={RECAP_TOP + 32} className="ls-caption">
        consecutive hours
      </text>
      <text x={VIEW_WIDTH - 148} y={RECAP_TOP + 44} className="ls-caption">
        off duty you have
      </text>
      <text x={VIEW_WIDTH - 148} y={RECAP_TOP + 56} className="ls-caption">
        60/70 hours available
      </text>
    </g>
  );
}

/** Wraps a caption to a pixel width, roughly, at ~4.2px per character. */
function WrappedCaption({
  x: startX,
  y,
  width,
  text,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
}) {
  const perLine = Math.max(8, Math.floor(width / 3.6));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > perLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());

  return (
    <>
      {lines.slice(0, 5).map((line, index) => (
        <text key={line + index} x={startX} y={y + index * 9} className="ls-micro">
          {line}
        </text>
      ))}
    </>
  );
}

/** A value written above a ruled line, with the caption underneath. */
function RuledField({
  x: fieldX,
  y,
  width,
  value,
  caption,
  centred = false,
  small = false,
}: {
  x: number;
  y: number;
  width: number;
  value: string;
  caption?: string;
  centred?: boolean;
  small?: boolean;
}) {
  return (
    <g>
      <text
        x={centred ? fieldX + width / 2 : fieldX + 6}
        y={y - 5}
        className={small ? "ls-value ls-value-sm" : "ls-value"}
        textAnchor={centred ? "middle" : "start"}
      >
        {value}
      </text>
      <line x1={fieldX} y1={y} x2={fieldX + width} y2={y} stroke="#111827" strokeWidth={1} />
      {caption && (
        <text
          x={centred ? fieldX + width / 2 : fieldX}
          y={y + 12}
          className="ls-caption"
          textAnchor={centred ? "middle" : "start"}
        >
          {caption}
        </text>
      )}
    </g>
  );
}

/** A value inside a ruled box, with the caption underneath. */
function BoxedField({
  x: boxX,
  y,
  width,
  height,
  value,
  caption,
  caption2,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  caption: string;
  caption2?: string;
}) {
  return (
    <g>
      <rect
        x={boxX} y={y} width={width} height={height}
        fill="#ffffff" stroke="#111827" strokeWidth={0.9}
      />
      <text x={boxX + width / 2} y={y + height / 2 + 6} className="ls-value"
        textAnchor="middle">
        {value}
      </text>
      <text x={boxX + width / 2} y={y + height + 12} className="ls-caption"
        textAnchor="middle">
        {caption}
      </text>
      {caption2 && (
        <text x={boxX + width / 2} y={y + height + 23} className="ls-caption"
          textAnchor="middle">
          {caption2}
        </text>
      )}
    </g>
  );
}
