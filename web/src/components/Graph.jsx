import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import "d3-transition";
import { typeVar } from "../api.js";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Clip the line from a card's centre towards `toward` at the card's edge.
function clip(n, toward, pad = 5) {
  const dx = toward.x - n.x, dy = toward.y - n.y;
  const hw = (n.w || 80) / 2 + pad, hh = (n.h || 30) / 2 + pad;
  const s = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return s >= 1 ? { x: toward.x, y: toward.y } : { x: n.x + dx * s, y: n.y + dy * s };
}

/**
 * Live physics graph. Cards hang on springy links: drag one and its neighbours
 * bounce after it; links are elastic strings that wobble as cards move.
 */
const Graph = forwardRef(function Graph(
  { nodes, edges, visible, matches, selected, hovered, onHover, onSelect, onBackground, calm = false },
  ref,
) {
  const wrapRef = useRef(null);
  const worldRef = useRef(null);
  const linkLayerRef = useRef(null);
  const sim = useRef(null);
  const simNodes = useRef(new Map()); // id -> live node (keeps position across reloads)
  const simLinks = useRef([]);
  const slots = useRef(new Map()); // id -> DOM element
  const paths = useRef(new Map()); // edge id -> SVG path
  const transform = useRef(zoomIdentity);
  const zoomer = useRef(null);
  const drag = useRef(null);
  const settled = useRef(false);
  const [, force] = useState(0);
  const calmRef = useRef(calm);
  const still = () => calmRef.current || reducedMotion(); // "keep the graph still" or the OS asks for less motion

  /* ---------- drawing (runs every tick, outside React) ---------- */
  const draw = () => {
    const calm = still();
    for (const n of sim.current?.nodes() || []) {
      const el = slots.current.get(n.id);
      if (!el) continue;
      // measure real movement (a dragged card has no velocity of its own)
      const mx = n.px === undefined ? 0 : n.x - n.px, my = n.py === undefined ? 0 : n.y - n.py;
      n.px = n.x; n.py = n.y;
      // the card swings like a pendulum: tilts against the motion, overshoots, settles
      // slow drift barely tilts; fast flings swing hard
      const target = calm ? 0 : Math.sign(mx) * Math.min(16, 0.7 * Math.abs(mx) ** 1.6);
      n.rv = ((n.rv || 0) + (target - (n.rot || 0)) * 0.16) * 0.8;
      n.rot = (n.rot || 0) + n.rv;
      const speed = Math.hypot(mx, my);
      n.sq = (n.sq || 0) + ((calm ? 0 : Math.min(speed * 0.012, 0.09)) - (n.sq || 0)) * 0.25;
      const stretch = 1 + n.sq;
      el.style.transform = `translate(${n.x}px, ${n.y}px) translate(-50%, -50%) rotate(${n.rot}deg) scale(${stretch}, ${2 - stretch})`;
    }
    for (const l of simLinks.current) {
      const p = paths.current.get(l.id);
      if (!p) continue;
      const s = l.source, t = l.target;
      const dx = t.x - s.x, dy = t.y - s.y, len = Math.hypot(dx, dy) || 1;
      // resting curve: bowed slightly to one side
      const goal = { x: (s.x + t.x) / 2 - (dy / len) * len * 0.1, y: (s.y + t.y) / 2 + (dx / len) * len * 0.1 };
      if (!l.cp) l.cp = { ...goal, vx: 0, vy: 0 };
      if (calm) Object.assign(l.cp, goal);
      else {
        // damped spring: the string lags behind and wobbles into place
        l.cp.vx = l.cp.vx * 0.82 + (goal.x - l.cp.x) * 0.09;
        l.cp.vy = l.cp.vy * 0.82 + (goal.y - l.cp.y) * 0.09;
        l.cp.x += l.cp.vx; l.cp.y += l.cp.vy;
      }
      const a = clip(s, l.cp), b = clip(t, l.cp);
      p.setAttribute("d", `M${a.x},${a.y} Q${l.cp.x},${l.cp.y} ${b.x},${b.y}`);
    }
  };

  useEffect(() => {
    calmRef.current = calm;
    const s = sim.current;
    if (!s) return;
    s.velocityDecay(still() ? 0.45 : 0.22).alphaTarget(still() ? 0 : 0.012).restart();
  }, [calm]);

  /* ---------- simulation ---------- */
  useEffect(() => {
    const s = forceSimulation()
      .velocityDecay(still() ? 0.45 : 0.22)
      .alphaDecay(0.018)
      .force("link", forceLink().id((d) => d.id).distance((l) => 120 + ((l.source.w || 80) + (l.target.w || 80)) * 0.22).strength(0.32))
      .force("charge", forceManyBody().strength(-480).distanceMax(700))
      .force("collide", forceCollide((d) => (d.w || 80) * 0.52 + 12).strength(0.85).iterations(2))
      .force("x", forceX(0).strength(0.035))
      .force("y", forceY(0).strength(0.05))
      .on("tick", draw);
    {
      // a gentle drift so the graph feels alive while idle
      let t = 0;
      s.force("float", () => {
        t += 1;
        if (still()) return;
        for (const n of s.nodes()) {
          n.vx += Math.sin(t * 0.011 + n.phase) * 0.012;
          n.vy += Math.cos(t * 0.009 + n.phase * 1.3) * 0.012;
        }
      });
      s.alphaTarget(still() ? 0 : 0.012);
    }
    sim.current = s;
    const onVis = () => (document.hidden ? s.stop() : s.restart());
    document.addEventListener("visibilitychange", onVis);
    return () => { s.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // merge new data into the live simulation, keeping positions of known cards
  useEffect(() => {
    const live = simNodes.current;
    const keep = new Map();
    const shown = nodes.filter((n) => visible.has(n.id));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const d of shown) {
      let n = live.get(d.id);
      if (!n) {
        const nb = edges.map((e) => (e.source === d.id ? e.target : e.target === d.id ? e.source : null)).find((x) => x && live.get(x));
        const anchor = nb ? live.get(nb) : null;
        const a = Math.random() * Math.PI * 2;
        n = { id: d.id, x: anchor ? anchor.x + Math.cos(a) * 60 : Math.cos(a) * 200, y: anchor ? anchor.y + Math.sin(a) * 60 : Math.sin(a) * 200, phase: Math.random() * 10 };
      }
      n.data = byId.get(d.id);
      keep.set(d.id, n);
    }
    simNodes.current = new Map([...live, ...keep]);
    const oldLinks = new Map(simLinks.current.map((l) => [l.id, l]));
    simLinks.current = edges
      .filter((e) => keep.has(e.source) && keep.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, cp: oldLinks.get(e.id)?.cp }));
    const s = sim.current;
    s.nodes([...keep.values()]);
    s.force("link").links(simLinks.current);
    force((x) => x + 1); // render the DOM for the new set, then measure
  }, [nodes, edges, visible]);

  // measure card sizes after render so links and collisions fit the real cards
  const lastKey = useRef("");
  useLayoutEffect(() => {
    if (!sim.current) return; // first paint happens before the simulation exists
    const key = sim.current.nodes().map((n) => n.id + ":" + n.data.label + ":" + n.data.degree).join("|") + "#" + simLinks.current.length;
    if (key === lastKey.current) return; // hover or selection only: no need to reheat
    lastKey.current = key;
    for (const n of sim.current.nodes()) {
      const el = slots.current.get(n.id);
      if (el) { n.w = el.offsetWidth; n.h = el.offsetHeight; }
    }
    const s = sim.current;
    s.force("collide").radius((d) => (d.w || 80) * 0.52 + 12);
    s.force("link").distance((l) => 120 + ((l.source.w || 80) + (l.target.w || 80)) * 0.22);
    if (!settled.current && s.nodes().length) {
      s.alpha(1);
      for (let i = 0; i < 160; i++) s.tick();
      s.alpha(0.5);
      draw();
      settled.current = true;
      requestAnimationFrame(() => fit(0));
      setTimeout(() => fit(900), 1400); // reframe once the springs have settled
    } else {
      s.alpha(Math.max(s.alpha(), 0.45));
    }
    s.restart();
  });

  /* ---------- pan & zoom ---------- */
  useEffect(() => {
    const wrap = select(wrapRef.current);
    const z = d3zoom()
      .scaleExtent([0.25, 2.5])
      .filter((e) => (e.type === "wheel" || !e.target.closest?.(".kslot")) && !e.button)
      .on("zoom", (e) => {
        const t = (transform.current = e.transform);
        worldRef.current.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
        linkLayerRef.current.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
        const st = wrapRef.current.style;
        st.setProperty("--g", 24 * t.k + "px");
        st.setProperty("--G", 120 * t.k + "px");
        st.setProperty("--px", t.x + "px");
        st.setProperty("--py", t.y + "px");
        if (e.sourceEvent && e.sourceEvent.type !== "wheel") drag.current = { ...(drag.current || {}), panned: true };
      });
    wrap.call(z).on("dblclick.zoom", null);
    zoomer.current = z;
  }, []);

  const fit = (duration = 500) => {
    const ns = sim.current.nodes();
    const el = wrapRef.current;
    if (!ns.length || !el) return;
    const x0 = Math.min(...ns.map((n) => n.x - (n.w || 80) / 2)), x1 = Math.max(...ns.map((n) => n.x + (n.w || 80) / 2));
    const y0 = Math.min(...ns.map((n) => n.y - (n.h || 30) / 2)), y1 = Math.max(...ns.map((n) => n.y + (n.h || 30) / 2));
    const W = el.clientWidth, H = el.clientHeight, pad = 70;
    const k = Math.min(1.4, (W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1));
    const t = zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    select(el).transition().duration(reducedMotion() ? 0 : duration).call(zoomer.current.transform, t);
  };

  useImperativeHandle(ref, () => ({
    fit,
    focus(id) {
      const n = simNodes.current.get(id);
      if (!n || !wrapRef.current) return;
      select(wrapRef.current).transition().duration(reducedMotion() ? 0 : 600).call(zoomer.current.translateTo, n.x, n.y);
    },
    shake() {
      // kick every card and let the springs sort it out
      for (const n of sim.current.nodes()) { n.vx += (Math.random() - 0.5) * 40; n.vy += (Math.random() - 0.5) * 40; }
      sim.current.alpha(1).restart();
    },
  }));

  /* ---------- dragging cards ---------- */
  const onPointerDown = (e, id) => {
    if (e.button) return;
    e.stopPropagation();
    const n = simNodes.current.get(id);
    const rect = wrapRef.current.getBoundingClientRect();
    drag.current = { id, n, x0: e.clientX, y0: e.clientY, moved: false };
    n.fx = n.x; n.fy = n.y;
    sim.current.alphaTarget(0.3).restart();
    const move = (ev) => {
      const d = drag.current;
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 4) d.moved = true;
      const [x, y] = transform.current.invert([ev.clientX - rect.left, ev.clientY - rect.top]);
      n.fx = x; n.fy = y;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      n.fx = null; n.fy = null;
      sim.current.alphaTarget(still() ? 0 : 0.012);
      if (!drag.current.moved) onSelect(id);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onWrapPointerDown = () => { drag.current = { panned: false }; };
  const onWrapClick = (e) => {
    if (e.target.closest(".kslot")) return;
    if (drag.current?.panned) { drag.current = null; return; }
    drag.current = null;
    onBackground();
  };

  /* ---------- render ---------- */
  const live = sim.current ? sim.current.nodes() : [];
  const near = new Set();
  const focusId = hovered || selected;
  if (focusId) {
    near.add(focusId);
    for (const l of simLinks.current) {
      const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
      if (s === focusId) near.add(t);
      if (t === focusId) near.add(s);
    }
  }
  const hoverOnly = hovered ? near : null;

  return (
    <div className="graph" ref={wrapRef} onPointerDown={onWrapPointerDown} onClick={onWrapClick} aria-label="Graph of notes">
      <svg className="strings" aria-hidden="true">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9" className="arrowhead" />
          </marker>
          <marker id="arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9" className="arrowhead hl" />
          </marker>
        </defs>
        <g ref={linkLayerRef}>
          {simLinks.current.map((l) => {
            const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
            const hl = focusId && (s === focusId || t === focusId);
            const dim = (matches && !(matches.has(s) && matches.has(t))) || (hoverOnly && !hl);
            return (
              <path key={l.id} className={`edge${hl ? " hl" : ""}${dim ? " dim" : ""}`} markerEnd={`url(#${hl ? "arrow-hl" : "arrow"})`}
                ref={(el) => (el ? paths.current.set(l.id, el) : paths.current.delete(l.id))} />
            );
          })}
        </g>
      </svg>
      <div className="world" ref={worldRef}>
        {live.map((n) => {
          const d = n.data;
          const cls = ["kcard",
            d.ghost && "ghost",
            selected === d.id && "sel",
            hovered === d.id && "hover",
            focusId && near.has(d.id) && d.id !== focusId && "near",
            ((matches && !matches.has(d.id)) || (hoverOnly && !hoverOnly.has(d.id))) && "dim",
          ].filter(Boolean).join(" ");
          return (
            <div key={d.id} className="kslot" ref={(el) => (el ? slots.current.set(d.id, el) : slots.current.delete(d.id))}
              onPointerDown={(e) => onPointerDown(e, d.id)}
              onPointerEnter={() => onHover(d.id)} onPointerLeave={() => onHover(null)}>
              <button className={cls} style={{ "--c": `var(${typeVar(d.type)})`, "--d": Math.min(d.degree, 6) }}
                onKeyDown={(e) => e.key === "Enter" && onSelect(d.id)} tabIndex={0}>
                {d.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default Graph;
