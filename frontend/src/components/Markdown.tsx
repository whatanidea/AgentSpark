import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-content text-sm text-zinc-600 leading-relaxed min-w-0 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-xl font-semibold text-zinc-900 mt-5 mb-3" {...p} />,
          h2: (p) => <h2 className="text-lg font-semibold text-zinc-800 mt-5 mb-3" {...p} />,
          h3: (p) => <h3 className="text-base font-semibold text-brand-800 mt-4 mb-2" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
          li: (p) => <li className="text-zinc-600" {...p} />,
          strong: (p) => <strong className="font-semibold text-zinc-800" {...p} />,
          a: (p) => <a className="text-brand-700 underline underline-offset-2" {...p} />,
          code: (p) => <code className="bg-zinc-100 text-brand-900 rounded px-1.5 py-0.5 text-[12px]" {...p} />,
          pre: (p) => <pre className="bg-zinc-50 border border-zinc-200 rounded p-4 overflow-x-auto my-3" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-zinc-50" {...p} />,
          th: (p) => <th className="text-left font-semibold text-zinc-700 px-3 py-3 border border-zinc-200" {...p} />,
          td: (p) => <td className="px-3 py-3 border border-zinc-200 text-zinc-600" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 border-brand-300 pl-4 text-zinc-500 my-3" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
