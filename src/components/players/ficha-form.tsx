import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FichaPersonagem, FichaCasa, serializeFichaPersonagem, serializeFichaCasa } from '@/lib/ficha';
import type { RecordRow } from './shared';

const habilidadeSchema = z.object({
  nome: z.string().min(1, 'Obrigatório'),
  graduacao: z.number().min(1).max(10),
  especializacao: z.string().nullable().optional(),
});

const fichaPersonagemSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').nullable(),
  casa: z.string().nullable(),
  idade: z.string().nullable(),
  jogador: z.string().nullable(),
  virtude: z.string().nullable(),
  vicio: z.string().nullable(),
  defesaIntriga: z.string().nullable(),
  compostura: z.string().nullable(),
  movimento: z.string().nullable(),
  corrida: z.string().nullable(),
  habilidades: z.array(habilidadeSchema),
});

export function FichaPersonagemForm({
  initialData,
  row,
  onSave,
  onCancel
}: {
  initialData: FichaPersonagem;
  row: RecordRow;
  onSave: (newContent: string) => unknown;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof fichaPersonagemSchema>>({
    resolver: zodResolver(fichaPersonagemSchema),
    defaultValues: {
      ...initialData,
      habilidades: initialData.habilidades.length > 0 ? initialData.habilidades : []
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'habilidades',
  });

  const onSubmit = (values: z.infer<typeof fichaPersonagemSchema>) => {
    // Para manter integridade da conversão, convertemos explicitamente os nulls
    const mappedValues: FichaPersonagem = {
      ...values,
      habilidades: values.habilidades.map(h => ({
        ...h,
        especializacao: h.especializacao ?? null
      }))
    };
    const newContent = serializeFichaPersonagem(mappedValues);
    onSave(newContent);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border p-4 rounded-md bg-zinc-50 dark:bg-zinc-900 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input {...form.register('nome')} placeholder="Nome do Personagem" />
        </div>
        <div className="space-y-2">
          <Label>Casa</Label>
          <Input {...form.register('casa')} placeholder="Casa" />
        </div>
        <div className="space-y-2">
          <Label>Idade</Label>
          <Input {...form.register('idade')} placeholder="Idade" />
        </div>
        <div className="space-y-2">
          <Label>Jogador</Label>
          <Input {...form.register('jogador')} placeholder="Jogador" />
        </div>
        <div className="space-y-2">
          <Label>Virtude</Label>
          <Input {...form.register('virtude')} placeholder="Ex: Corajoso" />
        </div>
        <div className="space-y-2">
          <Label>Vício</Label>
          <Input {...form.register('vicio')} placeholder="Ex: Arrogante" />
        </div>
        <div className="space-y-2">
          <Label>Defesa de Intriga</Label>
          <Input {...form.register('defesaIntriga')} placeholder="Valor numérico" />
        </div>
        <div className="space-y-2">
          <Label>Compostura</Label>
          <Input {...form.register('compostura')} placeholder="Valor numérico" />
        </div>
        <div className="space-y-2">
          <Label>Movimento</Label>
          <Input {...form.register('movimento')} placeholder="Ex: 4m" />
        </div>
        <div className="space-y-2">
          <Label>Corrida</Label>
          <Input {...form.register('corrida')} placeholder="Ex: 16m" />
        </div>
      </div>

      <div className="space-y-2 mt-4 border-t pt-4">
        <div className="flex justify-between items-center mb-2">
          <Label className="text-lg">Habilidades</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ nome: '', graduacao: 2, especializacao: '' })}>
            + Adicionar
          </Button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Habilidade</Label>
              <Input {...form.register(`habilidades.${index}.nome`)} placeholder="Nome" />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">Grau</Label>
              <Input type="number" {...form.register(`habilidades.${index}.graduacao`, { valueAsNumber: true })} />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Especialização</Label>
              <Input {...form.register(`habilidades.${index}.especializacao`)} placeholder="Opcional" />
            </div>
            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
              -
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar Ficha</Button>
      </div>
    </form>
  );
}

const atributoSchema = z.object({
  rotulo: z.string(),
  valor: z.number().min(0),
});

const fichaCasaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').nullable(),
  suserano: z.string().nullable(),
  regiao: z.string().nullable(),
  lorde: z.string().nullable(),
  lema: z.string().nullable(),
  fundacao: z.string().nullable(),
  arma: z.string().nullable(),
  herdeiro: z.string().nullable(),
  fortaleza: z.string().nullable(),
  atributos: z.array(atributoSchema),
  eventos: z.array(z.string()),
  posses: z.array(z.string()).optional(),
  exercitos: z.array(z.string()).optional(),
});

export function FichaCasaForm({
  initialData,
  row,
  onSave,
  onCancel
}: {
  initialData: FichaCasa;
  row: RecordRow;
  onSave: (newContent: string) => unknown;
  onCancel: () => void;
}) {
  const form = useForm<z.infer<typeof fichaCasaSchema>>({
    resolver: zodResolver(fichaCasaSchema),
    defaultValues: initialData,
  });

  const { fields: attrFields } = useFieldArray({
    control: form.control,
    name: 'atributos',
  });

  const { fields: eventFields, append: appendEvent, remove: removeEvent } = useFieldArray({
    control: form.control,
    name: 'eventos' as any,
  });

  const onSubmit = (values: z.infer<typeof fichaCasaSchema>) => {
    const newContent = serializeFichaCasa({
      ...values,
      eventos: values.eventos as unknown as string[]
    } as FichaCasa);
    onSave(newContent);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border p-4 rounded-md bg-zinc-50 dark:bg-zinc-900 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input {...form.register('nome')} placeholder="Nome da Casa" />
        </div>
        <div className="space-y-2">
          <Label>Lorde</Label>
          <Input {...form.register('lorde')} placeholder="Lorde Atual" />
        </div>
        <div className="space-y-2">
          <Label>Herdeiro</Label>
          <Input {...form.register('herdeiro')} placeholder="Herdeiro" />
        </div>
        <div className="space-y-2">
          <Label>Suserano</Label>
          <Input {...form.register('suserano')} placeholder="Suserano" />
        </div>
        <div className="space-y-2">
          <Label>Região</Label>
          <Input {...form.register('regiao')} placeholder="Região" />
        </div>
        <div className="space-y-2">
          <Label>Fortaleza</Label>
          <Input {...form.register('fortaleza')} placeholder="Fortaleza" />
        </div>
        <div className="space-y-2">
          <Label>Lema</Label>
          <Input {...form.register('lema')} placeholder="Lema da Família" />
        </div>
        <div className="space-y-2">
          <Label>Arma (Brasão)</Label>
          <Input {...form.register('arma')} placeholder="Arma/Símbolo" />
        </div>
        <div className="space-y-2">
          <Label>Fundação</Label>
          <Input {...form.register('fundacao')} placeholder="Fundação" />
        </div>
      </div>

      <div className="space-y-2 mt-4 border-t pt-4">
        <Label className="text-lg">Atributos da Casa</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {attrFields.map((field, index) => (
            <div key={field.id} className="space-y-1">
              <Label className="text-xs">{field.rotulo}</Label>
              <Input type="number" {...form.register(`atributos.${index}.valor`, { valueAsNumber: true })} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 mt-4 border-t pt-4">
        <div className="flex justify-between items-center mb-2">
          <Label className="text-lg">Eventos Históricos</Label>
          {/* @ts-ignore */}
          <Button type="button" variant="outline" size="sm" onClick={() => appendEvent('')}>
            + Adicionar
          </Button>
        </div>
        {form.watch('eventos').map((field, index) => (
          <div key={index} className="flex gap-2 items-center">
            <Input {...form.register(`eventos.${index}` as any)} placeholder="Descreva o evento" />
            <Button type="button" variant="destructive" size="icon" onClick={() => {
              const current = form.getValues('eventos');
              current.splice(index, 1);
              form.setValue('eventos', current);
            }}>
              -
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar Ficha</Button>
      </div>
    </form>
  );
}
