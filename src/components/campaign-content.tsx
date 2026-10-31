import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, X, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { contentParts, campaignMediaParts, imageToken, validateImage } from "@/lib/campaign-content";
import { ImageViewer } from "@/components/image-viewer";
import { cleanGalleryTitle } from "@/lib/gallery";

export function CampaignContent({ content }: { content: string }) {
 return <div className="campaign-prose">{campaignMediaParts(content).map((part,i)=>
  'text' in part
   ? <Fragment key={i}>{contentParts(part.text).map((piece,j)=>
      'text' in piece
       ? <p className="campaign-preserve" key={j}>{piece.text}</p>
       : <PrivateImage key={j} path={piece.path} caption={piece.caption}/>)}</Fragment>
   : <CampaignMedia key={i} kind={part.kind} id={part.id} title={part.title}/>
 )}</div>;
}
function CampaignMedia({kind,id,title}:{kind:'youtube'|'drive';id:string;title:string}){
 const [opened,setOpened]=useState(false);
 const youtube=kind==='youtube';
 const embed=youtube?'https://www.youtube-nocookie.com/embed/'+id:'https://drive.google.com/file/d/'+id+'/preview';
 const original=youtube?'https://www.youtube.com/watch?v='+id:'https://drive.google.com/file/d/'+id+'/view';
 return <figure className="campaign-media-embed">
  <figcaption><strong>{title}</strong><span> · {youtube?'Vídeo do YouTube':'Mídia do Google Drive'}</span></figcaption>
  {opened?<iframe title={title} src={embed} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{width:'100%',aspectRatio:'16 / 9',border:0}}/>:
   <Button type="button" variant="outline" onClick={()=>setOpened(true)}>Carregar mídia</Button>}
  <p><a href={original} target="_blank" rel="noopener noreferrer">Abrir na origem</a> · A visualização depende das permissões do arquivo.</p>
 </figure>;
}
export function PrivateImage({ path, caption, thumbnail = false }: { path: string; caption: string; thumbnail?: boolean }) {
  const { data, error } = useQuery({
    queryKey: ["private-image", path],
    queryFn: async () => {
      const result = await supabase.storage.from("campaign-images").download(path);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!data) return;
    const objectUrl = URL.createObjectURL(data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [data]);
  const cleanCaption = cleanGalleryTitle(caption);
  if (thumbnail) return url ? (
    <img src={url} alt={cleanCaption || "Retrato do integrante"} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: "inherit" }} />
  ) : <span role="img" aria-label={error ? "Retrato indisponível" : "Carregando retrato"}><UserRound size={28} aria-hidden="true" /></span>;
  return (
    <figure
      className="castle-gallery-artwork flex flex-col items-center w-full min-w-0 max-w-full m-0"
      style={{ boxSizing: "border-box" }}
    >
      {/* Moldura Externa Dourada Entalhada */}
      <div
        className="castle-gallery-frame relative w-full max-w-full overflow-hidden rounded"
        style={{
          padding: "10px",
          background:
            "linear-gradient(135deg, #8a6427 0%, #d6b265 20%, #a57c34 40%, #f0d78c 52%, #9c732f 72%, #6b4c1b 88%, #b99146 100%)",
          border: "2px solid #593d12",
          boxShadow:
            "0 12px 24px rgba(0,0,0,0.65), inset 0 2px 2px rgba(255,243,196,0.6), inset 0 0 0 3px #3c280c, inset 0 0 0 5px #c8a050",
          boxSizing: "border-box",
        }}
      >
        {/* Passe-partout (Matte) de Veludo Escuro */}
        <div
          className="castle-gallery-mat w-full overflow-hidden"
          style={{
            padding: "8px",
            background: "radial-gradient(circle, #281836 0%, #140b1d 100%)",
            border: "1px solid #4a3319",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.85)",
            boxSizing: "border-box",
          }}
        >
          {/* Berço da Tela (Canvas) — Contém a imagem sem vazar */}
          <div
            className="castle-gallery-canvas relative w-full overflow-hidden flex items-center justify-center"
            style={{
              border: "1.5px solid #c59b49",
              background: "#0d0712",
              aspectRatio: "3 / 4",
              maxHeight: "360px",
              boxShadow: "inset 0 0 16px rgba(0,0,0,0.8)",
            }}
          >
            {url ? (
              <ImageViewer
                src={url}
                caption={cleanCaption || "Imagem da campanha"}
                triggerClassName="h-full w-full p-0 flex items-center justify-center m-0"
                imageClassName="w-full h-full max-w-full max-h-full object-contain block transition-transform duration-300 hover:scale-[1.03]"
                imageStyle={{
                  width: "100%",
                  height: "100%",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <p role="status" style={{ color: "white", padding: "1rem", textAlign: "center" }}>
                {error ? "Imagem indisponível." : "Carregando imagem…"}
              </p>
            )}
          </div>
        </div>
      </div>

      {cleanCaption && (
        <figcaption
          className="castle-gallery-plaque mt-2 px-3.5 py-1.5 rounded text-center max-w-[95%]"
          style={{
            background: "linear-gradient(180deg, #3b2610 0%, #241608 100%)",
            border: "1px solid #c59b49",
            boxShadow: "0 4px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(245,217,142,0.35)",
            color: "#f5e2b8",
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: "0.9rem",
            fontWeight: 600,
            letterSpacing: "0.03em",
            lineHeight: 1.35,
          }}
        >
          • {cleanCaption} •
        </figcaption>
      )}

      {/* Metadados secundários (se houver) em cor clara legível e Botão Baixar Imagem estilizado */}
      <div className="mt-2 flex flex-col items-center gap-1.5 text-center w-full">
        {url && (
          <a
            href={url}
            download={cleanCaption || "imagem"}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(197, 155, 73, 0.55)",
              color: "#f3dfb1",
              padding: "4px 12px",
              borderRadius: "4px",
              fontSize: "0.8rem",
              textDecoration: "none",
              cursor: "pointer",
              display: "inline-block",
            }}
          >
            Baixar imagem
          </a>
        )}
      </div>
    </figure>
  );
}
export type PendingImage = { file: File; caption: string };
export function ImagePicker({
  images,
  onChange,
  disabled,
}: {
  images: PendingImage[];
  onChange: (images: PendingImage[]) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <div className="campaign-image-picker">
      <label>
        <span className="flex items-center gap-2">
          <ImagePlus size={18} />
          Imagens
        </span>
        <input
          aria-label="Adicionar imagens"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={disabled}
          onChange={(e) => {
            try {
              const files = Array.from(e.target.files ?? []);
              files.forEach(validateImage);
              onChange([...images, ...files.map((file) => ({ file, caption: file.name }))]);
              setError("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Imagem inválida.");
            }
            e.target.value = "";
          }}
        />
      </label>
      {images.map((image, i) => (
        <div className="campaign-image-selection" key={i}>
          <span>{image.file.name}</span>
          <input
            aria-label={"Legenda de " + image.file.name}
            value={image.caption}
            onChange={(e) =>
              onChange(
                images.map((item, n) => (n === i ? { ...item, caption: e.target.value } : item)),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Remover imagem"
            aria-label={"Remover " + image.file.name}
            disabled={disabled}
            onClick={() => onChange(images.filter((_, n) => n !== i))}
          >
            <X size={16} />
          </Button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export async function uploadImages(content: string, images: PendingImage[], mutation: string) {
  if (!images.length) return content;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada.");
  const tokens: string[] = [];
  for (const [i, image] of images.entries()) {
    validateImage(image.file);
    const ext = (
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      } as Record<string, string>
    )[image.file.type];
    const path = `${user.id}/${mutation}/${i}.${ext}`;
    const { error } = await supabase.storage
      .from("campaign-images")
      .upload(path, image.file, { contentType: image.file.type, upsert: false });
    if (error && error.message !== "The resource already exists" && error.statusCode !== "409")
      throw error;
    tokens.push(imageToken(path, image.caption));
  }
  return [content, ...tokens].join("\n\n");
}
