/*
 * Session store.
 *
 * One global session: files arrive on any tool page and stay available for
 * the next tool — that is the "chain tools without re-uploading" promise.
 * Results are held as Blobs with object URLs created only on demand.
 */
import { create } from 'zustand'
import type { ConsoleLevel, ConsoleLine } from '@/components/Console'
import type { PipelineStep } from './pipeline-codec'

export type SessionFileState = 'queued' | 'running' | 'done' | 'error'

export type StoredResult = {
  name: string
  type: string
  size: number
  blob: Blob
}

export type SessionFile = {
  id: string
  file: File
  name: string
  size: number
  type: string
  state: SessionFileState
  progress: number
  /** Millisecond duration of the last successful run. */
  ms?: number
  error?: string
  result?: StoredResult
}

const MAX_LOGS = 300

let fileCounter = 0
let logCounter = 0

export const nextFileId = (): string => `f${(fileCounter += 1)}`
export const nextLogId = (): number => (logCounter += 1)

type SessionState = {
  files: SessionFile[]
  logs: ConsoleLine[]
  /** Results produced by combining tools (e.g. the GIF maker). */
  combinedResults: StoredResult[]
  /** Secondary files a tool needs (e.g. a watermark logo), keyed by asset id. */
  assets: Record<string, File>
  /** The console's tool chain. */
  pipeline: PipelineStep[]
  running: boolean
  progress: number
  /** Current tool ref while running (drives the footer readout). */
  activeToolRef: string | null
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  clearFiles: () => void
  clearResults: () => void
  clearLogs: () => void
  log: (level: ConsoleLevel, text: string) => void
  patchFile: (id: string, patch: Partial<SessionFile>) => void
  setFilesState: (state: SessionFileState) => void
  setRunning: (running: boolean, toolRef?: string | null) => void
  setProgress: (value: number) => void
  addCombinedResult: (result: StoredResult) => void
  setAsset: (id: string, file: File | null) => void
  setPipeline: (steps: PipelineStep[]) => void
  addStep: (step: PipelineStep) => void
  removeStep: (index: number) => void
  moveStep: (index: number, delta: number) => void
  updateStepParams: (index: number, params: Record<string, unknown>) => void
}

export const useSession = create<SessionState>((set) => ({
  files: [],
  logs: [],
  combinedResults: [],
  assets: {},
  pipeline: [],
  running: false,
  progress: 0,
  activeToolRef: null,

  addFiles: (incoming) =>
    set((state) => {
      const files = incoming.map<SessionFile>((file) => ({
        id: nextFileId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        state: 'queued',
        progress: 0,
      }))
      return { files: [...state.files, ...files] }
    }),

  removeFile: (id) => set((state) => ({ files: state.files.filter((f) => f.id !== id) })),

  clearFiles: () => set({ files: [], progress: 0, combinedResults: [] }),

  clearResults: () =>
    set((state) => ({
      combinedResults: [],
      files: state.files.map((f) => ({
        ...f,
        state: 'queued' as SessionFileState,
        progress: 0,
        error: undefined,
        result: undefined,
        ms: undefined,
      })),
    })),

  clearLogs: () => set({ logs: [] }),

  log: (level, text) =>
    set((state) => {
      const line: ConsoleLine = { id: nextLogId(), level, text }
      const logs = [...state.logs, line]
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs }
    }),

  patchFile: (id, patch) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),

  setFilesState: (fileState) =>
    set((state) => ({
      files: state.files.map((f) => ({
        ...f,
        state: fileState,
        progress: fileState === 'running' ? 0 : f.progress,
      })),
    })),

  setRunning: (running, toolRef = null) => set({ running, activeToolRef: toolRef }),

  setProgress: (progress) => set({ progress }),

  addCombinedResult: (result) =>
    set((state) => ({ combinedResults: [...state.combinedResults, result] })),

  setAsset: (id, file) =>
    set((state) => {
      const assets = { ...state.assets }
      if (file) assets[id] = file
      else delete assets[id]
      return { assets }
    }),

  setPipeline: (steps) => set({ pipeline: steps }),

  addStep: (step) => set((state) => ({ pipeline: [...state.pipeline, step] })),

  removeStep: (index) =>
    set((state) => ({ pipeline: state.pipeline.filter((_, at) => at !== index) })),

  moveStep: (index, delta) =>
    set((state) => {
      const target = index + delta
      if (target < 0 || target >= state.pipeline.length) return state
      const pipeline = [...state.pipeline]
      const [moved] = pipeline.splice(index, 1)
      pipeline.splice(target, 0, moved)
      return { pipeline }
    }),

  updateStepParams: (index, params) =>
    set((state) => ({
      pipeline: state.pipeline.map((step, at) => (at === index ? { ...step, params } : step)),
    })),
}))
