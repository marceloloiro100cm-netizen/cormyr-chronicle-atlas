import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Download } from "lucide-react";
export function ImageViewer({
  src,
  caption,
  triggerClassName,
  imageClassName,
  imageStyle,
  onImageError,
}: {
  src: string;
  caption: string;
  triggerClassName?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  onImageError?: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={triggerClassName || "h-auto w-full p-0"}
          aria-label={"Ampliar " + caption}
        >
          <img
            src={src}
            onError={onImageError}
            alt={caption}
            loading="lazy"
            className={imageClassName}
            style={imageStyle}
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="campaign-theme image-viewer-dialog w-[1100px] max-w-[95vw] max-h-[94vh] overflow-hidden p-4 sm:p-6">
        <DialogTitle className="image-viewer-dialog__title">{caption || "Imagem da campanha"}</DialogTitle>
        <div className="campaign-actions image-viewer-dialog__actions">
          <Button
            size="icon"
            variant="outline"
            aria-label="Reduzir"
            title="Reduzir"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus />
          </Button>
          <Button variant="outline" aria-label="Restaurar zoom de 100%" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Ampliar"
            title="Ampliar"
            onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
          >
            <Plus />
          </Button>
          <Button variant="outline" asChild>
            <a href={src} download={caption || "imagem"}>
              <Download size={16} />
              Baixar Imagem
            </a>
          </Button>
        </div>
        <div className="image-viewer-dialog__viewport" role="region" aria-label={"Visualização completa: " + (caption || "imagem")}>
          <img
            src={src}
            alt={caption}
            onError={onImageError}
            className="image-viewer-dialog__image"
            style={zoom === 1
              ? { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" }
              : { width: `${zoom * 100}%`, height: "auto", maxWidth: zoom < 1 ? "100%" : "none", maxHeight: zoom < 1 ? "65vh" : "none", objectFit: "contain" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
