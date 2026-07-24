import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { importExcelSpreadsheet } from '@/app/services/api';
import { Toaster, toast } from 'sonner';

interface ImportPageProps {
  token: string;
  onUploadSuccess: () => void;
}

export function ImportPage({ token, onUploadSuccess }: ImportPageProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ importedCount: number; totalRowsProcessed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      toast.error('Invalid file format. Only .xlsx, .xls or .csv are allowed.');
      return;
    }
    setFile(selectedFile);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await importExcelSpreadsheet(file, token);
      setResult({ importedCount: res.importedCount, totalRowsProcessed: res.totalRowsProcessed });
      toast.success('Spreadsheet imported successfully!');
      onUploadSuccess();
      setFile(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to process spreadsheet.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Toaster position="top-right" richColors />

      {/* Info Card */}
      <div className="bg-white/[0.02] border border-white/[0.08] p-5 rounded-xl space-y-3">
        <h3 className="text-sm font-bold text-white tracking-wide">Spreadsheet Import Guidelines</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          To import your assets correctly, make sure the spreadsheet has recognizable headers in the first row.
        </p>
        
        {/* Colunas suportadas */}
        <div className="bg-black/35 rounded-lg p-3 border border-white/[0.04]">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Supported Columns</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1.5 gap-x-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Name / Host</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Type</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>IP Address</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>MAC Address</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>OS / System</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Risk / Score</span>
            </div>
          </div>
        </div>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-blue-500 bg-blue-500/[0.03]'
            : 'border-white/[0.08] hover:border-white/[0.16] bg-white/[0.01]'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
        />

        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-400 mb-4">
          <Upload className="w-6 h-6" />
        </div>

        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">{file.name}</p>
            <p className="text-xs text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">Drag and drop the spreadsheet or click to select</p>
            <p className="text-xs text-slate-500">Accepts .xlsx, .xls or .csv formats up to 5MB</p>
          </div>
        )}
      </div>

      {/* Action Button */}
      {file && (
        <button
          onClick={(e) => { e.stopPropagation(); handleUpload(); }}
          disabled={uploading}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing Spreadsheet...</span>
            </>
          ) : (
            <>
              <span>Upload and Import Assets</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      )}

      {/* Result Display */}
      {result && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1.5">
            <p className="font-bold text-sm">Import completed successfully!</p>
            <p>Total rows processed: <strong>{result.totalRowsProcessed}</strong></p>
            <p>Assets imported/updated: <strong>{result.importedCount}</strong></p>
          </div>
        </div>
      )}
    </div>
  );
}
