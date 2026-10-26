interface ActionFeedbackProps {
  error: string
  success: string
}

export function ActionFeedback({ error, success }: ActionFeedbackProps) {
  if (!error && !success) return null

  return (
    <div className="feedback-stack">
      {error && <p role="alert" className="notice error">{error}</p>}
      {success && <p role="status" className="notice success">{success}</p>}
    </div>
  )
}
