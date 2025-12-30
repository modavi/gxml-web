import './ToolbarButton.css'

function ToolbarButton({ icon, title, onClick, active = false }) {
  return (
    <button
      className={`toolbar-btn ${active ? 'active' : ''}`}
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export default ToolbarButton
