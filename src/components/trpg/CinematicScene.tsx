'use client';

import CinematicSceneImage from './CinematicSceneImage';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_FIT, BOARD_UNIT_REM, fieldFrame, MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM, replayMediaSource, SCENE_TRANSITION_SECONDS, type CinematicReplay, type ReplaySceneState } from '@/lib/cinematicReplay';

type Props = { scene: ReplaySceneState; replay: CinematicReplay; baseUrl?: string; onPendingChange: (pending: boolean) => void };
const DEFAULT_ZOOM = 1;
const DRAG_THRESHOLD = 5;
const STANDALONE_FOREGROUND_FIT = 0.75;
const clampZoom = (zoom: number) => Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));

export default function CinematicScene({ scene, replay, baseUrl, onPendingChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const initialZoom = clampZoom((replay.settings?.cameraZoom ?? DEFAULT_ZOOM * 100) / 100);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: initialZoom });
  const [viewport, setViewport] = useState({ width: 0, height: 0, rem: 16 });
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());
  const [loadedSources, setLoadedSources] = useState<Set<string>>(new Set());
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const gesture = useRef<{ points: Map<number, { x: number; y: number }>; start?: { x: number; y: number; distance: number; camera: typeof camera }; moved: boolean }>({ points: new Map(), moved: false });
  const frame = useMemo(() => fieldFrame(scene.fields), [scene.fields]);
  const showObjects = replay.settings?.showFieldObjects !== false;
  const activeFrame = showObjects ? frame : null;
  const fitScale = activeFrame ? Math.min(viewport.width * BOARD_FIT / activeFrame.width, viewport.height * BOARD_FIT / activeFrame.height) / BOARD_UNIT_REM : 1;
  const transition = useMemo(() => ({ duration: reducedMotion ? 0 : SCENE_TRANSITION_SECONDS, ease: 'easeInOut' as const }), [reducedMotion]);
  const failed = useCallback((source: string) => setFailedSources(current => current.has(source) ? current : new Set([...current, source])), []);
  const loaded = useCallback((source: string) => setLoadedSources(current => current.has(source) ? current : new Set([...current, source])), []);
  const recordRatio = useCallback((source: string, ratio: number) => setImageRatios(current => current[source] === ratio ? current : { ...current, [source]: ratio }), []);
  const validObjects = useMemo(() => showObjects && activeFrame ? (scene.fields?.objects ?? []).filter(o => o && typeof o.id === 'string' && ['x', 'y', 'width', 'height', 'rotation', 'zIndex'].every(k => Number.isFinite(o[k as keyof typeof o])) && o.width > 0 && o.height > 0) : [], [showObjects, activeFrame, scene.fields]);
  const foregroundSource = scene.foreground || scene.background;
  const imageSize = scene.foregroundEvent?.imageSize;
  const foregroundSize = imageSize && imageSize.width > 0 && imageSize.height > 0 ? imageSize : null;
  const standaloneScale = foregroundSize && foregroundSize.width > 0 && foregroundSize.height > 0 ? Math.min(1, viewport.width * STANDALONE_FOREGROUND_FIT / (foregroundSize.width * BOARD_UNIT_REM), viewport.height * STANDALONE_FOREGROUND_FIT / (foregroundSize.height * BOARD_UNIT_REM)) : 1;
  const foreground = useMemo(() => activeFrame ? {
    x: -activeFrame.x, y: -activeFrame.y,
    width: foregroundSize?.width ?? activeFrame.width, height: foregroundSize?.height ?? activeFrame.height,
  } : foregroundSize && foregroundSize.width > 0 && foregroundSize.height > 0 ? { x: 0, y: 0, width: foregroundSize.width * standaloneScale, height: foregroundSize.height * standaloneScale } : null, [activeFrame, foregroundSize, standaloneScale]);
  const sources = [scene.background, scene.foreground, ...validObjects.map(object => replayMediaSource(object.imageUrl, replay.assets, baseUrl))].filter(Boolean);
  const pending = sources.some(source => !loadedSources.has(source) && !failedSources.has(source));
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setViewport({ width: root.clientWidth / rem, height: root.clientHeight / rem, rem });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('button, input, label')) return;
      event.preventDefault(); event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === 1 ? viewport.rem : event.deltaMode === 2 ? root.clientHeight : 1);
      setCamera(current => ({ ...current, zoom: clampZoom(current.zoom * Math.exp(-delta * 0.0015)) }));
    };
    root.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); root.removeEventListener('wheel', wheel); };
  }, [viewport.rem]);

  // Camera gestures change only the outer transform; retain the image subtree.
  const backgroundLayer = useMemo(() => (
    <AnimatePresence initial={false}>
        {scene.background && !failedSources.has(scene.background) && <motion.div key={scene.background} initial={{ opacity: 0 }} animate={{ opacity: loadedSources.has(scene.background) ? 1 : 0 }} exit={{ opacity: 0 }} transition={transition} className="pointer-events-none absolute inset-0" style={{ filter: 'blur(0.5rem)' }}>
          <CinematicSceneImage src={scene.background} alt="현재 배경" className="object-cover" onLoaded={loaded} onFailed={failed} />
        </motion.div>}
      </AnimatePresence>
  ), [scene.background, failedSources, loadedSources, transition, loaded, failed]);
  const boardLayers = useMemo(() => (
    <div className="absolute inset-0" style={{ transform: `scale(${fitScale})`, transformOrigin: '50% 50%' }}>
          <AnimatePresence initial={false}>
            {foregroundSource && !failedSources.has(foregroundSource) && <motion.div key={foregroundSource} initial={{ opacity: 0 }} animate={{ opacity: loadedSources.has(foregroundSource) ? 1 : 0 }} exit={{ opacity: 0 }} transition={transition}
              className={foreground ? 'absolute left-1/2 top-1/2' : 'absolute inset-[6%]'}
              style={foreground ? { width: `${foreground.width * BOARD_UNIT_REM}rem`, height: `${foreground.height * BOARD_UNIT_REM}rem`, marginLeft: `${(foreground.x - foreground.width / 2) * BOARD_UNIT_REM}rem`, marginTop: `${(foreground.y - foreground.height / 2) * BOARD_UNIT_REM}rem` } : undefined}>
              <CinematicSceneImage src={foregroundSource} alt={scene.foreground ? "현재 전경" : "현재 배경"} className={foreground ? 'object-fill' : 'object-contain'} onLoaded={loaded} onFailed={failed} />
            </motion.div>}
          </AnimatePresence>
          <div className="absolute inset-0" style={{ zIndex: 1 }}>
            <AnimatePresence initial={false}>
              {validObjects.map(object => {
                const src = replayMediaSource(object.imageUrl, replay.assets, baseUrl);
                if (!src || failedSources.has(src)) return null;
                const figure = object.kind === 'figure';
                const height = figure && imageRatios[src] ? object.width * imageRatios[src] : object.height;
                const pose = { x: `${(object.x - activeFrame!.x) * BOARD_UNIT_REM}rem`, y: `${(object.y + (figure ? object.width - height : 0) - activeFrame!.y) * BOARD_UNIT_REM}rem`, width: `${object.width * BOARD_UNIT_REM}rem`, height: `${height * BOARD_UNIT_REM}rem`, rotate: object.rotation, opacity: loadedSources.has(src) ? 1 : 0 };
                return <motion.div key={object.id} data-field-object={object.id} data-field-kind={object.kind ?? 'screen-marker'} initial={{ ...pose, opacity: 0 }} animate={pose} exit={{ opacity: 0 }} transition={transition} className="absolute left-1/2 top-1/2" style={{ zIndex: object.zIndex, transformOrigin: figure ? '50% 100%' : '50% 50%', willChange: 'transform, opacity' }}>
                  <CinematicSceneImage src={src} alt={figure ? '장면 figure' : '장면 스크린·마커'} className="object-fill" onLoaded={loaded} onFailed={failed} onRatio={figure ? recordRatio : undefined} />
                </motion.div>;
              })}
            </AnimatePresence>
          </div>
        </div>
  ), [fitScale, scene.foreground, foregroundSource, foreground, activeFrame, validObjects, failedSources, loadedSources, imageRatios, replay.assets, baseUrl, transition, loaded, failed, recordRatio]);

  const rebase = () => {
    const points = [...gesture.current.points.values()];
    if (!points.length) return;
    const a = points[0], b = points[1] ?? a;
    gesture.current.start = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), camera };
  };

  return (
    <div ref={rootRef} className="absolute inset-0 select-none overflow-hidden touch-none" aria-label="시네마틱 장면"
      onClickCapture={event => { if (gesture.current.moved && !(event.target as Element).closest('button, input, label')) { event.preventDefault(); event.stopPropagation(); gesture.current.moved = false; } }}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as Element).closest('button, input, label')) return;
        if (!gesture.current.points.size) gesture.current.moved = false;
        gesture.current.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId); rebase();
      }}
      onPointerMove={event => {
        const g = gesture.current;
        if (!g.points.has(event.pointerId) || !g.start) return;
        g.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...g.points.values()], a = points[0], b = points[1] ?? a;
        const dx = (a.x + b.x) / 2 - g.start.x, dy = (a.y + b.y) / 2 - g.start.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD || points.length > 1) g.moved = true;
        if (!g.moved) return;
        setCamera({ x: g.start.camera.x + dx / viewport.rem, y: g.start.camera.y + dy / viewport.rem, zoom: points.length > 1 && g.start.distance ? clampZoom(g.start.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y) / g.start.distance) : g.start.camera.zoom });
      }}
      onPointerUp={event => { gesture.current.points.delete(event.pointerId); rebase(); }}
      onPointerCancel={event => { gesture.current.points.delete(event.pointerId); gesture.current.moved = true; rebase(); }}
    >
      {backgroundLayer}
      <motion.div className="pointer-events-none absolute inset-0" animate={{ x: `${camera.x}rem`, y: `${camera.y}rem`, scale: camera.zoom }} transition={{ duration: reducedMotion ? 0 : 0.08 }} style={{ willChange: 'transform' }}>
        {boardLayers}
      </motion.div>
      {failedSources.size > 0 && <p role="status" className="absolute right-4 top-4 max-w-[16rem] rounded bg-[#17191c]/90 px-3 py-2 text-xs text-stone-300">일부 이미지를 불러오지 못했습니다. 원본 주소를 확인해 주세요.</p>}
      {pending && <p role="status" className="pointer-events-none absolute inset-x-0 top-20 text-center text-sm text-stone-300">장면 불러오는 중…</p>}
    </div>
  );
}
