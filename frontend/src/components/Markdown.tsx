import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders LLM markdown (headings, lists, GFM tables, bold, code) with dark-theme
// styling — replaces the raw pre-wrap text that showed literal ### and | tables |.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-slate-200 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-xl font-extrabold text-white mt-4 mb-2" {...p} />,
          h2: (p) => <h2 className="text-lg font-bold text-violet-200 mt-4 mb-2" {...p} />,
          h3: (p) => <h3 className="text-base font-bold text-violet-300 mt-3 mb-1.5" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
          li: (p) => <li className="text-slate-300" {...p} />,
          strong: (p) => <strong className="font-semibold text-white" {...p} />,
          a: (p) => <a className="text-violet-300 underline" {...p} />,
          code: (p) => <code className="bg-black/40 text-emerald-200 rounded px-1.5 py-0.5 text-[12px]" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-violet-500/15" {...p} />,
          th: (p) => <th className="text-left font-bold text-violet-200 px-3 py-2 border border-white/10" {...p} />,
          td: (p) => <td className="px-3 py-2 border border-white/10 text-slate-300" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 border-violet-500/40 pl-3 text-slate-400 my-2" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
