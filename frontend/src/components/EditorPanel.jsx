import { useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import './EditorPanel.css'

const AUTO_UPDATE_DELAY = 500

function EditorPanel() {
  const {
    xmlContent,
    setXmlContent,
    isAutoUpdate,
    setAutoUpdate,
    renderGXML,
    error,
    schema,
  } = useAppStore()
  
  const timeoutRef = useRef(null)
  const editorRef = useRef(null)
  const schemaRef = useRef(schema)

  // Keep schemaRef in sync with latest schema
  useEffect(() => {
    schemaRef.current = schema
  }, [schema])

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    
    // Register GXML completion provider - use schemaRef to always get latest schema
    monaco.languages.registerCompletionItemProvider('xml', {
      triggerCharacters: ['<', ' ', '"', '='],
      provideCompletionItems: (model, position) => {
        return provideGXMLCompletions(model, position, monaco, schemaRef.current)
      }
    })
    
    // Ctrl+Enter to render
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      renderGXML()
    })
  }, [renderGXML])

  const handleEditorChange = useCallback((value) => {
    setXmlContent(value || '')
    
    if (isAutoUpdate) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        renderGXML()
      }, AUTO_UPDATE_DELAY)
    }
  }, [setXmlContent, isAutoUpdate, renderGXML])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleAutoUpdateChange = (e) => {
    const checked = e.target.checked
    setAutoUpdate(checked)
    if (checked) {
      renderGXML()
    }
  }

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h2>GXML Editor</h2>
        <div className="editor-controls">
          <label className="auto-update-label">
            <input
              type="checkbox"
              checked={isAutoUpdate}
              onChange={handleAutoUpdateChange}
            />
            Auto-update
          </label>
          <button className="render-btn" onClick={renderGXML}>
            Render (Ctrl+Enter)
          </button>
        </div>
      </div>
      
      <div className="editor-container">
        <Editor
          height="100%"
          language="xml"
          theme="vs-dark"
          value={xmlContent}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "Consolas, 'Courier New', monospace",
            fontLigatures: false,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 4,
            insertSpaces: true,
            formatOnPaste: true,
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            suggestOnTriggerCharacters: true,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true,
            },
          }}
        />
      </div>
      
      {error && (
        <div className="error-display">
          {error}
        </div>
      )}
    </div>
  )
}

// GXML autocomplete logic
function provideGXMLCompletions(model, position, monaco, schema) {
  const textUntilPosition = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  
  const suggestions = []
  const word = model.getWordUntilPosition(position)
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  }

  const lineText = model.getLineContent(position.lineNumber)
  const textBeforeCursor = lineText.substring(0, position.column - 1)
  
  // Attribute value completion
  const attrValueMatch = textBeforeCursor.match(/(\w+(?:-\w+)*)=["']$/)
  if (attrValueMatch) {
    const attrName = attrValueMatch[1]
    const tagMatch = textBeforeCursor.match(/<(\w+)(?:\s+[^>]*)?$/)
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase()
      const tagSchema = schema.tags[tagName]
      if (tagSchema?.attributes?.[attrName]?.values) {
        tagSchema.attributes[attrName].values.forEach((value) => {
          suggestions.push({
            label: value,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: value,
            range,
            detail: tagSchema.attributes[attrName].description || `Value for ${attrName}`,
          })
        })
      }
    }
    return { suggestions }
  }
  
  // Attribute name completion
  const tagMatch = textBeforeCursor.match(/<(\w+)(?:\s+[^>]*)?$/)
  if (tagMatch && !textBeforeCursor.endsWith('<')) {
    const tagName = tagMatch[1].toLowerCase()
    const tagSchema = schema.tags[tagName]
    if (tagSchema?.attributes) {
      const existingAttrs = textBeforeCursor.match(/(\w+(?:-\w+)*)=/g) || []
      const existingAttrNames = existingAttrs.map((a) => a.replace('=', ''))
      
      Object.entries(tagSchema.attributes).forEach(([attrName, attrDef]) => {
        if (!existingAttrNames.includes(attrName)) {
          suggestions.push({
            label: attrName,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: `${attrName}="$1"`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: attrDef.type || 'attribute',
            documentation: attrDef.description,
          })
        }
      })
    }
    return { suggestions }
  }
  
  // Tag name completion
  if (textBeforeCursor.endsWith('<')) {
    const textAfterCursor = lineText.substring(position.column - 1)
    const hasClosingBracket = textAfterCursor.startsWith('>')
    
    const insertRange = hasClosingBracket
      ? { ...range, endColumn: position.column + 1 }
      : range

    Object.entries(schema.tags).forEach(([tagName, tagSchema]) => {
      const attrNames = Object.keys(tagSchema.attributes || {}).join(', ')
      suggestions.push({
        label: tagName,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: `${tagName} $1/>`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: insertRange,
        detail: 'GXML element',
        documentation: tagSchema.description + (attrNames ? `\n\nAttributes: ${attrNames}` : ''),
      })
      
      if (tagSchema.children?.length > 0) {
        suggestions.push({
          label: `${tagName}...`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: `${tagName}>\n\t$1\n</${tagName}>`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: insertRange,
          detail: 'GXML element with children',
          documentation: tagSchema.description,
        })
      }
    })
    return { suggestions }
  }
  
  return { suggestions }
}

export default EditorPanel
