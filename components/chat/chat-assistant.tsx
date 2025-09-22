"use client";

import { useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Upload, MessageSquare, File } from "lucide-react";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  file?: {
    name: string;
    size: number;
    type: string;
  };
};

export default function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);

  const handleSubmit = async (
    message: { text?: string; files?: any[] },
    event: React.FormEvent
  ) => {
    if ((!message.text?.trim() && !selectedFile) || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: message.text || (selectedFile ? `Uploaded ${selectedFile.name}` : ""),
      file: selectedFile ? {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      } : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', message.text || "");
      
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }

    (event.target as HTMLFormElement).reset();
    setSelectedFile(null);
    setShowFileUpload(false);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1">
        <ConversationContent className="space-y-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Upload a document for analysis"
              description="Upload PDF, CSV, or Excel files to get AI-powered insights and analysis"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.content}
                  {message.file && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-gray-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {message.file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(message.file.size)} • {message.file.type}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {isLoading && (
            <Message from="assistant">
              <MessageContent>Thinking...</MessageContent>
            </Message>
          )}
        </ConversationContent>
      </Conversation>

      <div className="p-4 space-y-4">
        {showFileUpload && (
          <FileUpload
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            selectedFile={selectedFile}
          />
        )}
        
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Type your message or upload a file..." />
            <PromptInputToolbar>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFileUpload(!showFileUpload)}
                  className="flex items-center gap-2"
                >
                  {showFileUpload ? <MessageSquare className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  {showFileUpload ? "Hide Upload" : "Upload File"}
                </Button>
              </div>
              <PromptInputSubmit status={isLoading ? "submitted" : undefined} />
            </PromptInputToolbar>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}
