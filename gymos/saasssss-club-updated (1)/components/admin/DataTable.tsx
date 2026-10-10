import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  emptyMessage = "Aucune donnée disponible",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-12 text-center shadow-md backdrop-blur-md">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
          <Inbox className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-lg backdrop-blur-md">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="text-left text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-5 py-3.5"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {data.map((item, index) => (
              <tr
                key={index}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-200"
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-5 py-3.5 text-xs font-medium text-slate-800 dark:text-slate-200">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}