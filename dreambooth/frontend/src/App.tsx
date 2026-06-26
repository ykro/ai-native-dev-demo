import { useState, useRef, useCallback } from 'react'

const STEPS = ['Extracting scenes', 'Interpreting', 'Generating images']

interface DreamResult {
  scenes: string
  interpretation: string
  images: string[]
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

function App() {
  const [dreamText, setDreamText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [result, setResult] = useState<DreamResult | null>(null)
  const [error, setError] = useState('')
  const [speechNotSupported, setSpeechNotSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    if (!SpeechRecognitionAPI) {
      setSpeechNotSupported(true)
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'es-ES'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setDreamText(transcript)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognition.start()
    setIsRecording(true)
  }, [isRecording])

  const handleSubmit = async () => {
    if (!dreamText.trim() || loading) return

    // Stop recording if active
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
    }

    setLoading(true)
    setError('')
    setResult(null)
    setCurrentStep(0)

    // Simulate step progression
    const stepTimer1 = setTimeout(() => setCurrentStep(1), 3000)
    const stepTimer2 = setTimeout(() => setCurrentStep(2), 6000)

    try {
      const response = await fetch('/dream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: dreamText }),
      })

      if (!response.ok) throw new Error('Failed to process dream')

      const data: DreamResult = await response.json()
      setResult(data)
      setCurrentStep(3)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      clearTimeout(stepTimer1)
      clearTimeout(stepTimer2)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-violet-50/40">
      {/* Header */}
      <header className="pt-8 sm:pt-12 pb-6 sm:pb-8 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-800 tracking-tight">
          <span className="mr-3">&#127769;</span>DreamBooth
        </h1>
        <p className="mt-2 text-lg text-gray-500">Your Dreams, Illustrated</p>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-20">
        {/* Textarea */}
        <div className="relative">
          <textarea
            value={dreamText}
            onChange={(e) => setDreamText(e.target.value)}
            placeholder="Describe your dream..."
            rows={6}
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-gray-800 text-lg
                       placeholder:text-gray-400 shadow-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500
                       resize-none transition-shadow"
          />
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Voice button */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleRecording}
              disabled={loading}
              className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-colors shadow-md
                ${loading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : isRecording
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300'
                }`}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording && (
                <span className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping" />
              )}
              {/* Microphone SVG */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
              >
                <rect x="9" y="1" width="6" height="12" rx="3" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" y1="18" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            {isRecording && (
              <span className="text-sm font-medium text-amber-600">Recording...</span>
            )}
            {speechNotSupported && (
              <span className="text-sm text-red-500">
                Voice input is not supported in this browser.
              </span>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!dreamText.trim() || loading}
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-violet-600 text-white font-semibold text-lg shadow-md
                       hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? 'Processing...' : 'Record Dream'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        {/* Progress stepper */}
        {loading && (
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-center gap-3 sm:gap-2">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                    ${
                      i <= currentStep
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-sm font-medium ${
                    i <= currentStep ? 'text-violet-700' : 'text-gray-400'
                  }`}
                >
                  {step}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block w-10 h-0.5 ${
                      i < currentStep ? 'bg-violet-400' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-12 space-y-10 animate-[fadeIn_0.6s_ease-out]">
            {/* Interpretation */}
            <div className="border-l-4 border-violet-500 bg-white rounded-r-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-violet-600 uppercase tracking-wider mb-3">
                Interpretation
              </h2>
              <p className="text-gray-700 leading-relaxed text-lg italic">
                {result.interpretation}
              </p>
            </div>

            {/* Image gallery */}
            <div>
              <h2 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-5">
                Dream Visions
              </h2>
              <div className="grid grid-cols-1 gap-8">
                {result.images.map((src, i) => (
                  <div
                    key={i}
                    className="opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]"
                    style={{ animationDelay: `${i * 200}ms` }}
                  >
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Scene {i + 1}</p>
                    <img
                      src={src}
                      alt={`Dream scene ${i + 1}`}
                      className="w-full max-w-2xl mx-auto rounded-2xl shadow-xl hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Inline keyframes for fadeIn */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default App
