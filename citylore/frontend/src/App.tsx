import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react'

interface Results {
  analysis: string
  legend: string
  panels: string[]
  error?: string
}

const MAX_DIMENSION = 1920
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB hard limit

const STEPS = ['Analyzing place', 'Generating legend', 'Creating panels']

function resizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (file.size <= 500_000) return resolve(file)

    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return resolve(file)

      const scale = MAX_DIMENSION / Math.max(width, height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to resize image'))
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.85,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

function parseLegend(legend: string): { title: string; panels: string[] } {
  const lines = legend.split('\n')
  let title = ''
  const panels: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('TITLE:')) {
      title = trimmed.replace('TITLE:', '').trim()
    } else if (trimmed.startsWith('PANEL')) {
      const desc = trimmed.includes(':') ? trimmed.split(':', 2)[1].trim() : trimmed
      panels.push(desc)
    }
  }

  return { title: title || 'Urban Legend', panels }
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const doneRef = useRef(false)

  // Visibility change handler: polling fallback for iPhone screen-off
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!jobId || doneRef.current) return

      // Close the SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      // Poll once to recover state
      fetch(`/status/${jobId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error)
            setCurrentStep(-1)
            setIsProcessing(false)
            return
          }

          if (data.step !== undefined) {
            setCurrentStep(data.step)
          }

          setResults((prev) => ({
            analysis: data.analysis || prev?.analysis || '',
            legend: data.legend || prev?.legend || '',
            panels: data.panels && data.panels.length > 0 ? data.panels : prev?.panels || [],
          }))

          if (data.status === 'done') {
            doneRef.current = true
            setCurrentStep(3)
            setIsProcessing(false)
          } else {
            // Re-open SSE if not done
            connectSSE(jobId)
          }
        })
        .catch(() => {
          // If poll fails, try to reconnect SSE
          connectSSE(jobId)
        })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [jobId])

  const connectSSE = useCallback((id: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/stream/${id}`)
    eventSourceRef.current = es

    es.addEventListener('step', (e) => {
      const data = JSON.parse(e.data)
      setCurrentStep(data.step)
    })

    es.addEventListener('analysis', (e) => {
      const data = JSON.parse(e.data)
      setResults((prev) => ({
        analysis: data.analysis,
        legend: prev?.legend || '',
        panels: prev?.panels || [],
      }))
    })

    es.addEventListener('legend', (e) => {
      const data = JSON.parse(e.data)
      setResults((prev) => ({
        analysis: prev?.analysis || '',
        legend: data.legend,
        panels: prev?.panels || [],
      }))
    })

    es.addEventListener('panel', (e) => {
      const data = JSON.parse(e.data)
      setResults((prev) => {
        const panels = [...(prev?.panels || [])]
        panels[data.index] = data.image
        return {
          analysis: prev?.analysis || '',
          legend: prev?.legend || '',
          panels,
        }
      })
    })

    es.addEventListener('done', () => {
      doneRef.current = true
      setCurrentStep(3)
      setIsProcessing(false)
      es.close()
      eventSourceRef.current = null
    })

    es.addEventListener('error', (e) => {
      // Check if it's a server-sent error event with data
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        const data = JSON.parse(messageEvent.data)
        setError(data.error || 'Something went wrong')
      } else {
        setError('Connection lost')
      }
      setCurrentStep(-1)
      setIsProcessing(false)
      es.close()
      eventSourceRef.current = null
    })
  }, [])

  const handleFile = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 20MB.`)
      return
    }
    setSelectedFile(file)
    setResults(null)
    setError(null)
    setCurrentStep(-1)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setIsDragOver(false), [])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const analyze = useCallback(async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setError(null)
    setResults(null)
    setCurrentStep(0)
    setJobId(null)
    doneRef.current = false

    try {
      const resized = await resizeImage(selectedFile)
      const formData = new FormData()
      formData.append('file', resized)

      const res = await fetch('/analyze', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const id = data.job_id
      setJobId(id)
      connectSSE(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setCurrentStep(-1)
      setIsProcessing(false)
    }
  }, [selectedFile, connectSSE])

  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setSelectedFile(null)
    setImagePreview(null)
    setResults(null)
    setError(null)
    setCurrentStep(-1)
    setIsProcessing(false)
    setJobId(null)
    doneRef.current = false
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const legendData = results?.legend ? parseLegend(results.legend) : null
  const showResults = results && legendData && !isProcessing

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
            <span className="mr-2" role="img" aria-label="camera">📷</span>CityLore
          </h1>
          <p className="text-gray-500 text-sm mt-1">Urban Legends from Real Places</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Upload Section */}
        {!showResults && (
          <div className="space-y-8">
            {/* Drop Zone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out',
                isDragOver
                  ? 'border-[#FF6B4D] bg-orange-50 scale-[1.01]'
                  : 'border-gray-200 bg-[#F9FAFB] hover:border-[#FF6B4D]/50 hover:bg-gray-50/80',
                imagePreview ? 'p-4' : 'p-8 sm:p-16',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
              />

              {imagePreview ? (
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-80 rounded-xl shadow-md object-contain"
                  />
                  <p className="text-sm text-gray-500">
                    {selectedFile?.name} — click or drop to change
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-5xl mb-4" role="img" aria-label="city">🏙️</div>
                  <p className="text-lg font-medium text-[#1F2937]">
                    Drop a photo of any place
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    or click to browse — JPG, PNG, WebP
                  </p>
                </div>
              )}
            </div>

            {/* Analyze Button */}
            {selectedFile && !isProcessing && (
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); analyze() }}
                  className="px-8 py-3 rounded-xl text-white font-semibold text-lg bg-[#FF6B4D] hover:bg-[#e85a3d] active:scale-95 transition-all duration-200 shadow-lg shadow-orange-200 cursor-pointer"
                >
                  Generate Legend
                </button>
              </div>
            )}

            {/* Progress Stepper */}
            {isProcessing && (
              <div className="flex justify-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-3">
                  {STEPS.map((step, i) => (
                    <div key={step} className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={[
                            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500',
                            currentStep > i
                              ? 'bg-[#FF6B4D] text-white'
                              : currentStep === i
                                ? 'bg-[#FF6B4D] text-white animate-pulse'
                                : 'bg-gray-200 text-gray-400',
                          ].join(' ')}
                        >
                          {currentStep > i ? '✓' : i + 1}
                        </div>
                        <span
                          className={[
                            'text-sm font-medium transition-colors duration-300',
                            currentStep >= i ? 'text-[#1F2937]' : 'text-gray-400',
                          ].join(' ')}
                        >
                          {step}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className={[
                            'hidden sm:block w-12 h-0.5 transition-colors duration-500',
                            currentStep > i ? 'bg-[#FF6B4D]' : 'bg-gray-200',
                          ].join(' ')}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progressive panels during processing */}
            {isProcessing && results && results.panels.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-700 text-center">
                  Panels arriving...
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {results.panels.map((panel, i) =>
                    panel ? (
                      <div
                        key={i}
                        className="group animate-[fadeIn_0.5s_ease-in-out]"
                        style={{ animationDelay: `${i * 150}ms`, animationFillMode: 'both' }}
                      >
                        <img
                          src={panel}
                          alt={`Panel ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-xl shadow-lg group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center">
                <p className="text-red-500 font-medium">{error}</p>
                <button
                  onClick={reset}
                  className="mt-3 text-sm text-gray-500 underline hover:text-gray-700 cursor-pointer"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {showResults && legendData && (
          <div className="space-y-10 animate-[fadeIn_0.6s_ease-in-out]">
            {/* Back button */}
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-[#FF6B4D] transition-colors flex items-center gap-1 cursor-pointer"
            >
              ← New photo
            </button>

            {/* Legend Header */}
            <div className="text-center space-y-4">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#111827] tracking-tight">
                {legendData.title}
              </h2>
              <div className="max-w-2xl mx-auto">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Original place"
                    className="w-full max-h-64 object-contain rounded-xl shadow-md mb-6"
                  />
                )}
              </div>
            </div>

            {/* Panel Descriptions + Images */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-700 text-center">
                The Legend in Panels
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {legendData.panels.map((desc, i) => (
                  <div
                    key={i}
                    className="group animate-[fadeIn_0.5s_ease-in-out]"
                    style={{ animationDelay: `${i * 150}ms`, animationFillMode: 'both' }}
                  >
                    {results.panels[i] && (
                      <img
                        src={results.panels[i]}
                        alt={`Panel ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-xl shadow-lg group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed px-1">
                      <span className="font-semibold text-[#FF6B4D]">Panel {i + 1}:</span>{' '}
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Place Analysis (collapsible) */}
            <details className="group bg-[#F3F4F6] rounded-xl p-5 border border-[#F9FAFB]">
              <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                View place analysis
              </summary>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {results.analysis}
              </p>
            </details>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-gray-400">
          CityLore — Powered by Gemini
        </div>
      </footer>

      {/* Global keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
