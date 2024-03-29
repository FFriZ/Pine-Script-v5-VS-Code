import { Helpers, PineSharedCompletionState } from './index'
import { Class } from './PineClass'
import * as vscode from 'vscode'


export class PineInlineCompletionContext implements vscode.InlineCompletionItemProvider {
  selectedCompletionText: string | undefined;
  provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    const selectedCompletionText = context.selectedCompletionInfo?.text
    
    if (selectedCompletionText) {
      this.selectedCompletionText = selectedCompletionText
      PineSharedCompletionState.setSelectedCompletion(context.selectedCompletionInfo?.text)
      vscode.commands.executeCommand('editor.action.triggerParameterHints')
    }
    
    console.log(context.selectedCompletionInfo?.text, 'selectedCompletionInfo')
    return null
  }

  clearSelectedCompletion() {
    PineSharedCompletionState.setSelectedCompletion(undefined)
  }
}

export class PineCompletionProvider implements vscode.CompletionItemProvider {
  completionItems: vscode.CompletionItem[] = []
  docType: any
  userDocs: any
  map: any
  isMapNew: any
  namespaces: any
  match: string | undefined = undefined
  activeArg: string | null = null
  signatureCompletionsFlag: boolean = false
  sigCompletions: Record<string, any> = {}

  checkCompletions(): Record<string, any>[] {
    try {
      const activeArg = PineSharedCompletionState.getActiveArg
      if (PineSharedCompletionState.getSignatureCompletionsFlag && activeArg) {
        PineSharedCompletionState.setSignatureCompletionsFlag(false)
        return PineSharedCompletionState.getCompletions[activeArg] ?? []
      }
      return []
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Provides completion items for the current position in the document.
   * @param document - The current document.
   * @param position - The current position within the document.
   * @param token - A cancellation token.
   * @returns An array of completion items.
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem> | null | undefined> {
    try {
      // Initialize the completion items array
      this.completionItems = []

      const completionsFromState: Record<string, any>[] = this.checkCompletions()

      if (token.isCancellationRequested) {
      }

      if (completionsFromState.length > 0) {
        return await this.signatureCompletions(document, position, completionsFromState)
      } else {
        return await this.mainCompletions(document, position)
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Creates a completion item for the given name and documentation.
   * @param document - The current document.
   * @param name - The name of the item.
   * @param namespace - The namespace of the item, if it's a method.
   * @param doc - The documentation for the item.
   * @param position - The current position within the document.
   * @param argCompletion - A flag indicating whether this is an argument completion.
   * @returns A CompletionItem object.
   */
  async createCompletionItem(
    document: vscode.TextDocument,
    name: string,
    namespace: string | null,
    doc: any,
    position: vscode.Position,
    argCompletion: boolean = false,
  ) {
    try {
      // Determine if the item is a method
      const isMethod = doc?.isMethod ?? false
      // Get the kind of the item
      const kind = doc?.kind
      // Determine if the item is the default (applies to function params for now)
      const def = doc?.default ?? false
      // name the label variable
      let label = name
      // If the item is a function or method, add parentheses to the name
      let openParen = ''
      let closeParen = ''
      let moveCursor = false
      if (kind && (kind.includes('Function') || kind.includes('Method'))) {
        label = name.replace(/\(\)/g, '')
        openParen = '('
        closeParen = ')'
        moveCursor = true
      }
      // Format the syntax and check for overloads
      const modifiedSyntax = Helpers.formatSyntax(name, doc, isMethod)
      // Format the label and description
      label = isMethod ? `${namespace}.${label.split('.').pop()}` : label
      label = label + openParen + closeParen

      const formattedDesc = Helpers.formatUrl(Helpers?.checkDesc(doc?.desc))
      // Determine the kind of the completion item
      const itemKind = await this.determineCompletionItemKind(kind)
      // Create a new CompletionItem object
      const completionItem = new vscode.CompletionItem(label, itemKind)
      completionItem.documentation = new vscode.MarkdownString(`${formattedDesc} \`\`\`pine\n${modifiedSyntax}\n\`\`\``)
      const detail = (def ? '(Default) ' : '') + kind ?? ''
      completionItem.detail = detail

      // Use a snippet string for the insert text
      let insertText = label
      const textBeforeCursor = document.lineAt(position.line).text.substring(0, position.character)

      // If it's an argument completion, prepend a space
      if (argCompletion) {
        const wordBoundaryRegexArgs = /(?:\(|,)?\s*\b[\w.]+$/
        const argStartMatch = wordBoundaryRegexArgs.exec(textBeforeCursor)
        let argStart = argStartMatch ? position.character - argStartMatch[0].length : position.character
        if (argStart < 0) {
          argStart = 0
        }

        if (!PineSharedCompletionState.getIsLastArg) {
          insertText += ''
        }

        // Set the replacement range and insert text of the completion item
        completionItem.insertText = insertText
        completionItem.range = new vscode.Range(new vscode.Position(position.line, argStart), position)

        // if (PineSharedCompletionState.getIsLastArg) {
        //   completionItem.command = { command: 'cursorRight', title: 'Move Cursor Outside of Ending ")".' }
        //   PineSharedCompletionState.setIsLastArg(false)
        // }

      } else {
        // Calculate the start position of the word being completed
        const wordBoundaryRegex = /\b[\w.]+$/
        const wordStartMatch = wordBoundaryRegex.exec(textBeforeCursor)
        let wordStart = wordStartMatch ? position.character - wordStartMatch[0].length : position.character
        if (wordStart < 0) {
          wordStart = 0
        }

        // Set the replacement range and insert text of the completion item
        completionItem.insertText = insertText
        completionItem.preselect = def ? true : false
        completionItem.range = new vscode.Range(new vscode.Position(position.line, wordStart), position)
        
        if (moveCursor) {
          completionItem.command = { command: 'pine.completionAccepted', title: 'Completion Accept Logic.' }
          moveCursor = false
        }
      }


      return completionItem
    } catch (error) {
      console.error(error)
      return null
    }
  }

  /**
   * Determines the kind of a completion item based on its type.
   * @param kind - The type of the item.
   * @returns The kind of the completion item.
   */
  async determineCompletionItemKind(kind?: string) {
    try {
      // If the kind is not specified, return Text as the default kind
      if (!kind) {
        return vscode.CompletionItemKind.Text
      }

      // Define a mapping from item types to completion item kinds
      const kinds: any = {
        Function: vscode.CompletionItemKind.Function,
        Method: vscode.CompletionItemKind.Method,
        Local: vscode.CompletionItemKind.Class,
        Imported: vscode.CompletionItemKind.Class,
        Integer: vscode.CompletionItemKind.EnumMember,
        Color: vscode.CompletionItemKind.Color,
        Control: vscode.CompletionItemKind.Keyword,
        Variable: vscode.CompletionItemKind.Variable,
        Boolean: vscode.CompletionItemKind.EnumMember,
        Constant: vscode.CompletionItemKind.Enum,
        Type: vscode.CompletionItemKind.TypeParameter,
        Annotation: vscode.CompletionItemKind.Snippet,
        Property: vscode.CompletionItemKind.Property,
        Parameter: vscode.CompletionItemKind.Field,
        Other: vscode.CompletionItemKind.Value,
      }
      // For each key in the mapping, if the kind includes the key, return the corresponding completion item kind
      for (const key in kinds) {
        if (kind.toLowerCase().includes(key.toLowerCase())) {
          return kinds[key]
        }
      }
      // If no matching key is found, return Text as the default kind
      return vscode.CompletionItemKind.Text
    } catch (error) {
      console.error(error)
      return vscode.CompletionItemKind.Text
    }
  }

  // moves cursor inside of () without using the TextEdits, then fires the signatureHelp
  async completionAccepted() {
    try {
      vscode.commands.executeCommand('cursorLeft')
      vscode.commands.executeCommand('editor.action.triggerParameterHints')
    } catch (error) {
      console.error(error)
    }
  }

  async methodCompletions(document: vscode.TextDocument, position: vscode.Position, match: string) {
    try {

      const map = Class.PineDocsManager.getMap('methods', 'methods2')

      let splitName0: string = ''
      let splitName1: string = ''
      if (match.includes('.')) {
        const split = match.split('.') ?? ''
        if (split.length > 1) {
          splitName1 = split.pop() ?? ''
          splitName0 = split.pop() ?? ''
        } else if (split.length === 1) {
          splitName0 = split.pop() ?? ''
        }
      } else {
        return []
      }


      if (!splitName0 || Class.PineDocsManager.getAliases.includes(splitName0)) {
        return []
      }

      let typoTrack = 0
      for (let [name, doc] of map.entries()) {
        if (!doc.isMethod || name[0] === '*') {
          continue
        }

        let docNameSplitLast: string | null = null
        if (name.includes('.')) {
          const docNameSplit = name.split('.')
          docNameSplitLast = docNameSplit.pop() ?? null
        } else {
          docNameSplitLast = name
        }

        const namejoin = `${splitName0}.${docNameSplitLast}`

        if (
          splitName0 &&
          docNameSplitLast &&
          namejoin.toLowerCase().startsWith(`${splitName0}.`.toLowerCase())
        ) {
          for (const i of `${splitName0}.${splitName1}`) {
            if (typoTrack > 2) {
              break
            }
            if (!namejoin.toLowerCase().includes(i.toLowerCase())) {
              typoTrack++
            }
          }
          if (typoTrack > 2) {
            typoTrack = 0
            continue
          }

          let nType = await Helpers.identifyType(splitName0)
          let dType = Helpers.getThisTypes(doc)
          if (!nType || !dType) {
            continue
          }

          let flag1 = false
          let flag2 = false
          let namespaceType = null
          let docType = null

          nType = nType.replace(/([\w.]+)\[\]/, 'array<$1>')
          dType = dType.replace(/([\w.]+)\[\]/, 'array<$1>')

          for (const t of ['array', 'matrix', 'map']) {
            if (nType?.includes(t)) {
              namespaceType = t
              flag1 = true
            }
            
            if (dType?.includes(t)) {
              docType = t
              flag2 = true
            }
          }

          if (flag1 && flag2) {

            flag1 = false
            flag2 = false

            for (const r of ['<any>', '<type>']) {
              if (nType?.includes(r)) {
                flag1 = true
              }
              if (dType?.includes(r)) {
                flag2 = true
              }
            }

          }

          if (!flag1) {
            namespaceType = nType
          }

          if (!flag2) {
            docType = dType
          }

          if (typeof namespaceType !== 'string' || typeof docType !== 'string') {
            continue
          }

          if (!docType.includes(namespaceType) && !namespaceType.includes(docType)) {
            continue
          }

          const completionItem = await this.createCompletionItem(document, name, splitName0, doc, position, false)

          if (completionItem) {
            this.completionItems.push(completionItem)
          }
        }
      }
    } catch (error) {
      console.error('An error occurred:', error);
      return []
    }
  }

  async functionCompletions(document: vscode.TextDocument, position: vscode.Position, match: string) {
    try {
      // Get the documentation map
      const map = Class.PineDocsManager.getMap(
        'functions',
        'completionFunctions',
        'variables',
        'variables2',
        'constants',
        'UDT',
        'fields',
      )

      // For each entry in the map, if the name starts with the matched text, create a completion item for it

      let typoTrack = 0
      for (const [name, doc] of map.entries()) {
        if (name.toLowerCase().startsWith(match[0].toLowerCase())) {
          for (const i of match) {
            if (typoTrack > 1) {
              break
            }
            if (!name.includes(i.toLowerCase())) {
              typoTrack++
            }
          }
          if (typoTrack > 1) {
            typoTrack = 0

            continue
          }

          const completionItem = await this.createCompletionItem(document, name, null, doc, position, false)
          if (completionItem) {
            this.completionItems.push(completionItem)
          }
        }
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  async mainCompletions(document: vscode.TextDocument, position: vscode.Position) {
    try {
      // Get the text on the current line up to the cursor position
      const line = document.lineAt(position)
      if (line.text.trim().startsWith('//') || line.text.trim().startsWith('import')) {
        return []
      }

      const linePrefix = line.text.substring(0, position.character)
      // If there's no text before the cursor, return an empty array
      if (!linePrefix) {
        return []
      }
      // If there are no completions in the shared state, match the text before the cursor
      const match = linePrefix.match(/[\w.]+$/)?.[0].trim()
      if (!match) {
        return []
      }

      await this.functionCompletions(document, position, match)
      await this.methodCompletions(document, position, match)

      if (this.completionItems.length > 0) {
        return new vscode.CompletionList(this.completionItems, true)
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  
  async signatureCompletions(document: vscode.TextDocument, position: vscode.Position, docs: Record<string, any>[]) {
 
    try {
      if (!docs || docs.length === 0) {
        PineSharedCompletionState.clearCompletions()
        return []
      }

      let index = 0
      for (const completion of docs) {
        const completionItem = await this.createCompletionItem(
          document,
          completion.name,
          null,
          completion,
          position,
          true,
        )
        if (completionItem) {
          completionItem.sortText = `order${index.toString().padStart(4, '0')}`;
          this.completionItems.push(completionItem)
        }
        index++
      }

      PineSharedCompletionState.clearCompletions()
      const cList = new vscode.CompletionList(this.completionItems)
      return cList
    } catch (error) {
      console.error(error)
      return []
    }
  }
}

