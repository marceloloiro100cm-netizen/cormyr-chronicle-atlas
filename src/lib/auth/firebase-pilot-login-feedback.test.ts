import {describe,expect,it} from 'vitest';
import {firebasePilotLoginFailure} from './firebase-pilot-login-feedback';

describe('Firebase login and Cloud role acceptance are distinct states',()=>{
  it('does not call a successful login a failed password when Cloud is disabled',()=>{
    const message=firebasePilotLoginFailure(true);
    expect(message).toContain('senha foi aceita pelo Firebase');
    expect(message).toContain('Atlas está indisponível');
    expect(message).not.toContain('senha incorreta');
  });
  it('never reports campaign access as confirmed after an Auth failure',()=>{
    const message=firebasePilotLoginFailure(false);
    expect(message).toContain('Não foi possível autenticar');
    expect(message).toContain('Recuperar senha');
    expect(message).not.toContain('acesso autorizado');
  });
});
