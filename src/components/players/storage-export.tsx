import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { listExportFiles, signExportFile } from "@/lib/storage-export.functions";
import { EXPORT_BUCKETS } from "@/lib/storage-export/core";
import { exportBucket } from "@/lib/storage-export/browser";
import type { Directory } from "@/lib/storage-export/browser";
export function StorageExport() {
  const list = useServerFn(listExportFiles),
    sign = useServerFn(signExportFile);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function start() {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<Directory>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      setMessage(
        "Abra o site no Chrome ou Edge de um computador para escolher a pasta de destino.",
      );
      return;
    }
    setBusy(true);
    try {
      const root = await picker.call(window, { mode: "readwrite" });
      const abort = new AbortController();
      controller.current = abort;
      for (const bucket of EXPORT_BUCKETS)
        await exportBucket({
          root,
          bucket,
          list: (prefix, offset) => list({ data: { bucket, prefix, offset } }),
          sign: (path) => sign({ data: { bucket, path } }),
          signal: abort.signal,
          progress: (text) => setMessage(`${bucket}: ${text}`),
        });
      setMessage(
        "Exportação concluída dos cinco buckets. Compacte a pasta escolhida para enviar o backup.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Exportação interrompida. Selecione a mesma pasta para retomar.",
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return (
    <details className="campaign-add">
      <summary>Backup de imagens e jornais</summary>
      <p>
        Baixa todas as pastas de imagens e jornais, mantendo os caminhos originais. Use Chrome ou
        Edge no computador e mantenha esta aba aberta.
      </p>
      <p>
        Escolha uma pasta vazia para o primeiro backup. Para retomar, escolha a mesma pasta. Evite
        editar imagens durante a cópia. Este backup não inclui o banco de dados nem as contas.
      </p>
      <Button type="button" disabled={busy} onClick={start}>
        Exportar todos os arquivos
      </Button>
      {busy && (
        <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
          Pausar
        </Button>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </details>
  );
}
