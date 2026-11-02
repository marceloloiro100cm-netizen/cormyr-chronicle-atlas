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
      <DialogContent className="campaign-theme max-w-[95vw] w-[1100px]">
        <DialogTitle>{caption || "Imagem da campanha"}</DialogTitle>
        <div className="campaign-actions">
          <Button
            size="icon"
            variant="outline"
            aria-label="Reduzir"
            title="Reduzir"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus />
          </Button>
          <Button variant="outline" onClick={() => setZoom(1)}>
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
        <div className="max-h-[70vh] overflow-auto">
          <img src={src} alt={caption} className="max-w-none" style={{ width: `${zoom * 100}%` }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
