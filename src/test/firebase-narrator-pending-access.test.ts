import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const src=(path:string)=>readFileSync(path,'utf8');

describe('Firebase narrator pending-account panel is private and read-only',()=>{
  const route=src('src/routes/firebase-access.tsx');
  const api=src('src/routes/api/firebase-cloud-read.ts');
  const service=src('scripts/firebase/cloud-readonly-service.mjs');
  const component=src('src/components/firebase/FirebasePendingAccessReview.tsx');

  it('renders only for server-authorized narrator session',()=>{
    expect(route).toContain("view.profile==='narrador'&&\n        <FirebasePendingAccessReview");
    expect(route).toContain("readCloud<PendingAccessReview>('listAccessRemediation')");
    expect(service).toContain("if(viewer.profile!=='narrador')deny('access_denied',403)");
    expect(api).toContain("case 'listAccessRemediation':");
    expect(api).toContain("service.listAccessRemediation(token)");
  });
  it('does not write accounts, email recipients, or historical Firestore docs',()=>{
    expect(component).toContain('readOnly');
    expect(component).toContain('sourceImmutable');
    expect(service).toContain('readyForRemediation:false');
    expect(service).toContain('authWrites:0,firestoreWrites:0');
    expect(component).not.toMatch(/(?:localStorage|sessionStorage)\s*\.|updateUser\s*\(|setDoc\s*\(|writeBatch\s*\(/);
    expect(api).toContain("'Cache-Control':'private, no-store, max-age=0'");
    expect(api).toContain("crossOriginRejected(request)");
  });
  it('previews only after explicit identity review and never sends admin or password status',()=>{
    expect(route).toContain("'previewAccessRemediation'");
    expect(route).toContain("readCloud<PendingDecisionPreview>");
    expect(api).toContain("service.previewAccessRemediation(");
    expect(service).toContain("if(viewer.profile!=='narrador')deny('access_denied',403)");
    expect(component).toContain('manualReviewConfirmed:true');
    expect(component).toContain('Validar proposta sem aplicar');
    expect(component).toContain('result.decisionApplied!==false');
    expect(component).toContain('result.firestoreWrites!==0');
    expect(component).not.toMatch(/(?:setDoc|updateDoc|updateUser|writeBatch)\s*\(/);
    expect(component).not.toContain('profile:\'narrador\'');
  });
  it('does not offer an implicit user-role or password approval button',()=>{
    expect(component).toContain('consulta privada');
    expect(component).not.toMatch(/Ativar conta|Salvar perfil|Confirmar senha alterada/);
    expect(component).toContain('nenhuma decisão é aplicada');
  });
});
