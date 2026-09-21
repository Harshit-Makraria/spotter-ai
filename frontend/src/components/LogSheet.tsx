import { useMemo } from "react";
import type { DutyStatus, LogDay, TripInputs } from "../types";

/**
 * A driver's daily log drawn to the layout prescribed by 49 CFR 395.8:
 * a 24-hour graph grid over four duty-status rows, quarter-hour tick marks,
 * a totals column, and a remarks ruler naming the place of every change of
 * duty status.
 */

const GRID_LEFT = 168;
const HOUR_WIDTH = 34;
const GRID_WIDTH = 24 * HOUR_WIDTH;
const GRID_RIGHT = GRID_LEFT + GRID_WIDTH;
const ROW_HEIGHT = 27;
const GRID_TOP = 266;
const GRID_BOTTOM = GRID_TOP + 4 * ROW_HEIGHT;

const REMARKS_TOP = GRID_BOTTOM + 34;
const REMARKS_HEIGHT = 26;

const VIEW_WIDTH = 1100;
const VIEW_HEIGHT = 650;

const ROWS: { status: DutyStatus; line: number; label: string[] }[] = [
  { status: "off_duty", line: 1, label: ["Off", "Duty"] },
  { status: "sleeper_berth", line: 2, label: ["Sleeper", "Berth"] },
  { status: "driving", line: 3, label: ["Driving"] },
  { status: "on_duty", line: 4, label: ["On Duty", "(Not Driving)"] },
];

// The printed DOT form leaves hour 1 blank because the word "Midnight"
// already occupies that space, and ends the scale at 23.
const HOUR_LABELS = [
  "Midnight", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  "Noon", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23",
];

const x = (minute: number) => GRID_LEFT + (minute / 60) * HOUR_WIDTH;
const rowCentre = (index: number) => GRID_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;

function formatHours(hours: number): string {
  if (Number.isInteger(hours)) return String(hours);
  return hours.toFixed(2).replace(/0$/, "");
}

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return { month, day, year };
}

interface Props {
  day: LogDay;
  dayNumber: number;
  totalDays: number;
  inputs: TripInputs;
  carrier?: string;
  driver?: string;
  /** Trip reference used as the manifest number on the sheet. */
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
  const { month, day: dayOfMonth, year } = formatDate(day.date);

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

  return (
    <svg
      className="logsheet"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`Driver's daily log for ${day.date}, sheet ${dayNumber} of ${totalDays}`}
    >
      <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#ffffff" />

      {/* ---------------- header ---------------- */}
      <text x={24} y={34} className="ls-dept">U.S. DEPARTMENT OF TRANSPORTATION</text>
      <text x={VIEW_WIDTH / 2} y={30} className="ls-title" textAnchor="middle">
        DRIVER&rsquo;S DAILY LOG
      </text>
      <text x={VIEW_WIDTH / 2} y={46} className="ls-subtitle" textAnchor="middle">
        (ONE CALENDAR DAY &mdash; 24 HOURS)
      </text>
      <text x={VIEW_WIDTH - 24} y={28} className="ls-fine" textAnchor="end">
        ORIGINAL &mdash; Submit to carrier within 13 days
      </text>
      <text x={VIEW_WIDTH - 24} y={42} className="ls-fine" textAnchor="end">
        DUPLICATE &mdash; Driver retains possession for eight days
      </text>
      <text x={VIEW_WIDTH - 24} y={60} className="ls-sheet-no" textAnchor="end">
        SHEET {dayNumber} OF {totalDays}
      </text>

      {/* Row 1 — date, and where the day's driving began and ended. */}
      <HeaderField x={30} y={92} width={58} value={month} caption="(MONTH)" />
      <HeaderField x={96} y={92} width={48} value={dayOfMonth} caption="(DAY)" />
      <HeaderField x={152} y={92} width={66} value={year} caption="(YEAR)" />
      <HeaderField x={264} y={92} width={288} value={from} caption="FROM" />
      <HeaderField x={570} y={92} width={288} value={to} caption="TO" />

      {/* Row 2 — 395.8(d): miles, vehicle numbers, certification. */}
      <HeaderField
        x={30} y={148} width={172}
        value={day.miles_driven ? day.miles_driven.toFixed(0) : "0"}
        caption="(TOTAL MILES DRIVING TODAY)"
      />
      <HeaderField
        x={220} y={148} width={172}
        value={day.miles_driven ? day.miles_driven.toFixed(0) : "0"}
        caption="(TOTAL MILEAGE TODAY)"
      />
      <HeaderField
        x={410} y={148} width={230} value="—"
        caption="TRUCK/TRACTOR & TRAILER NUMBERS"
      />
      <HeaderField
        x={676} y={148} width={220} value={driver}
        caption="(DRIVER'S SIGNATURE IN FULL)"
        note="I certify that these entries are true and correct"
      />

      {/* Row 3 — carrier identification. */}
      <HeaderField
        x={30} y={204} width={240} value={carrier}
        caption="(NAME OF CARRIER OR CARRIERS)"
      />
      <HeaderField
        x={288} y={204} width={220} value={inputs.current_location}
        caption="(MAIN OFFICE ADDRESS)"
      />
      <HeaderField
        x={526} y={204} width={220} value={inputs.current_location}
        caption="(HOME TERMINAL ADDRESS)"
      />
      <HeaderField x={764} y={204} width={132} value="—" caption="(NAME OF CO-DRIVER)" />

      {/* 395.8(d)(6): the time base the grid is drawn against. */}
      <text x={GRID_LEFT} y={GRID_TOP - 22} className="ls-fine">
        24-hour period starting time: MIDNIGHT — home terminal time
      </text>

      <text x={GRID_RIGHT + 30} y={GRID_TOP - 30} className="ls-caption" textAnchor="middle">
        TOTAL
      </text>
      <text x={GRID_RIGHT + 30} y={GRID_TOP - 19} className="ls-caption" textAnchor="middle">
        HOURS
      </text>

      {/* ---------------- hour scale ---------------- */}
      <HourScale y={GRID_TOP - 6} />

      {/* ---------------- grid ---------------- */}
      <g className="ls-grid">
        {ROWS.map((row, index) => (
          <rect
            key={row.status}
            x={GRID_LEFT}
            y={GRID_TOP + index * ROW_HEIGHT}
            width={GRID_WIDTH}
            height={ROW_HEIGHT}
            fill={index % 2 === 0 ? "#ffffff" : "#fbfbfd"}
            stroke="#1f2a44"
            strokeWidth={0.9}
          />
        ))}

        {/* quarter-hour tick marks inside every row */}
        {ROWS.map((row, rowIndex) =>
          Array.from({ length: 24 }).flatMap((_, hour) =>
            [1, 2, 3].map((quarter) => {
              const top = GRID_TOP + rowIndex * ROW_HEIGHT;
              const depth = quarter === 2 ? ROW_HEIGHT * 0.55 : ROW_HEIGHT * 0.32;
              const tickX = x(hour * 60 + quarter * 15);
              return (
                <line
                  key={`${row.status}-${hour}-${quarter}`}
                  x1={tickX} y1={top} x2={tickX} y2={top + depth}
                  stroke="#4a5875" strokeWidth={0.6}
                />
              );
            }),
          ),
        )}

        {/* full-hour separators */}
        {Array.from({ length: 25 }).map((_, hour) => (
          <line
            key={`hour-${hour}`}
            x1={x(hour * 60)} y1={GRID_TOP} x2={x(hour * 60)} y2={GRID_BOTTOM}
            stroke="#1f2a44" strokeWidth={hour % 6 === 0 ? 1.1 : 0.7}
          />
        ))}

        {/* row labels */}
        {ROWS.map((row, index) => (
          <g key={`label-${row.status}`}>
            <text x={GRID_LEFT - 12} y={rowCentre(index) + 1} className="ls-rowlabel" textAnchor="end">
              {row.label[0]}
            </text>
            {row.label[1] && (
              <text x={GRID_LEFT - 12} y={rowCentre(index) + 12} className="ls-rowlabel-sub" textAnchor="end">
                {row.label[1]}
              </text>
            )}
            <text x={GRID_LEFT - 148} y={rowCentre(index) + 1} className="ls-rownum">
              {row.line}.
            </text>
          </g>
        ))}
      </g>

      {/* ---------------- the drawn duty line ---------------- */}
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
              x1={x(entry.start_minute)}
              y1={rowCentre(rowIndex)}
              x2={x(entry.end_minute)}
              y2={rowCentre(rowIndex)}
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

      {/* ---------------- totals column ---------------- */}
      {ROWS.map((row, index) => (
        <text
          key={`total-${row.status}`}
          x={GRID_RIGHT + 30}
          y={rowCentre(index) + 5}
          className="ls-total"
          textAnchor="middle"
        >
          {formatHours(day.totals[row.status] ?? 0)}
        </text>
      ))}
      <line
        x1={GRID_RIGHT + 6} y1={GRID_BOTTOM + 6}
        x2={GRID_RIGHT + 56} y2={GRID_BOTTOM + 6}
        stroke="#1f2a44" strokeWidth={1}
      />
      <text
        x={GRID_RIGHT + 30} y={GRID_BOTTOM + 22}
        className={`ls-total ls-total-sum${day.balanced ? "" : " is-bad"}`}
        textAnchor="middle"
      >
        = {formatHours(Object.values(day.totals).reduce((a, b) => a + b, 0))}
      </text>

      {/* ---------------- remarks ---------------- */}
      <text x={GRID_LEFT - 12} y={REMARKS_TOP + 16} className="ls-rowlabel" textAnchor="end">
        REMARKS
      </text>
      <rect
        x={GRID_LEFT} y={REMARKS_TOP} width={GRID_WIDTH} height={REMARKS_HEIGHT}
        fill="#ffffff" stroke="#1f2a44" strokeWidth={0.9}
      />
      {Array.from({ length: 24 }).flatMap((_, hour) =>
        [1, 2, 3].map((quarter) => {
          const tickX = x(hour * 60 + quarter * 15);
          return (
            <line
              key={`rtick-${hour}-${quarter}`}
              x1={tickX} y1={REMARKS_TOP} x2={tickX} y2={REMARKS_TOP + REMARKS_HEIGHT * 0.34}
              stroke="#4a5875" strokeWidth={0.6}
            />
          );
        }),
      )}
      {Array.from({ length: 25 }).map((_, hour) => (
        <line
          key={`rhour-${hour}`}
          x1={x(hour * 60)} y1={REMARKS_TOP}
          x2={x(hour * 60)} y2={REMARKS_TOP + REMARKS_HEIGHT}
          stroke="#1f2a44" strokeWidth={hour % 6 === 0 ? 1.1 : 0.7}
        />
      ))}

      {day.remarks.map((remark, index) => {
        const markX = x(remark.minute);
        // Stops close together would print their labels on top of each other,
        // so drop every other one onto a lower baseline.
        const previous = day.remarks[index - 1];
        const crowded =
          previous !== undefined && x(remark.minute) - x(previous.minute) < 34;
        const drop = crowded ? 13 : 0;
        const labelY = REMARKS_TOP + REMARKS_HEIGHT + 12 + drop;

        return (
          <g key={`remark-${index}`} className="ls-remark">
            <line
              x1={markX} y1={REMARKS_TOP}
              x2={markX} y2={REMARKS_TOP + REMARKS_HEIGHT + 6 + drop}
              stroke="#1d4ed8" strokeWidth={1.2}
            />
            <text
              x={markX + 4}
              y={labelY}
              transform={`rotate(58 ${markX + 4} ${labelY})`}
              className="ls-remark-text"
            >
              {remark.location || remark.note}
            </text>
          </g>
        );
      })}

      {/* --------- shipping documents: required by 395.8(d)(9) --------- */}
      <g className="ls-shipping">
        <text x={24} y={VIEW_HEIGHT - 126} className="ls-caption">
          SHIPPING DOCUMENTS
        </text>
        <HeaderField
          x={24} y={VIEW_HEIGHT - 100} width={210}
          value={shippingNumber}
          caption="DVL OR MANIFEST NO."
        />
        <HeaderField
          x={262} y={VIEW_HEIGHT - 100} width={330}
          value={`${inputs.pickup_location} — general freight`}
          caption="SHIPPER & COMMODITY"
        />
        <text x={620} y={VIEW_HEIGHT - 104} className="ls-fine">
          Enter name of place you reported and where released from work,
        </text>
        <text x={620} y={VIEW_HEIGHT - 92} className="ls-fine">
          and when and where each change of duty occurred.
        </text>
      </g>

      {/* ---------------- recap ---------------- */}
      <g className="ls-recap">
        <text x={24} y={VIEW_HEIGHT - 58} className="ls-caption">
          RECAP — {inputs.cycle_limit_hours} HOUR /{" "}
          {inputs.cycle_limit_hours === 70 ? 8 : 7} DAY
        </text>
        <RecapCell x={24} label="On-duty hours today" value={`${formatHours(day.total_on_duty_hours)}`} />
        <RecapCell x={214} label="Total hours in cycle" value={`${formatHours(day.cycle_hours_used)}`} />
        <RecapCell
          x={404} label="Hours available tomorrow"
          value={`${formatHours(day.cycle_hours_remaining)}`}
        />
        <RecapCell x={594} label="Miles driving today" value={day.miles_driven.toFixed(0)} />
      </g>
    </svg>
  );
}

function minutesToClock(minutes: number): string {
  const clamped = Math.min(minutes, 24 * 60 - 1);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function HourScale({ y }: { y: number }) {
  return (
    <g className="ls-hours">
      {HOUR_LABELS.map((label, hour) =>
        label ? (
          <text
            key={label + hour}
            x={x(hour * 60)}
            y={y}
            className="ls-hour"
            textAnchor={hour === 0 ? "start" : "middle"}
          >
            {label}
          </text>
        ) : null,
      )}
    </g>
  );
}

function HeaderField({
  x: fieldX,
  y,
  width,
  value,
  caption,
  note,
}: {
  x: number;
  y: number;
  width: number;
  value: string;
  caption: string;
  note?: string;
}) {
  return (
    <g>
      {note && (
        <text x={fieldX + width / 2} y={y - 22} className="ls-fine" textAnchor="middle">
          {note}
        </text>
      )}
      <text x={fieldX + width / 2} y={y - 4} className="ls-value" textAnchor="middle">
        {value}
      </text>
      <line x1={fieldX} y1={y} x2={fieldX + width} y2={y} stroke="#1f2a44" strokeWidth={1} />
      <text x={fieldX + width / 2} y={y + 12} className="ls-caption" textAnchor="middle">
        {caption}
      </text>
    </g>
  );
}

function RecapCell({ x: cellX, label, value }: { x: number; label: string; value: string }) {
  return (
    <g>
      <rect
        x={cellX} y={VIEW_HEIGHT - 48} width={178} height={34}
        fill="#f6f8fc" stroke="#1f2a44" strokeWidth={0.8}
      />
      <text x={cellX + 10} y={VIEW_HEIGHT - 34} className="ls-recap-label">
        {label}
      </text>
      <text x={cellX + 168} y={VIEW_HEIGHT - 21} className="ls-recap-value" textAnchor="end">
        {value}
      </text>
    </g>
  );
}
