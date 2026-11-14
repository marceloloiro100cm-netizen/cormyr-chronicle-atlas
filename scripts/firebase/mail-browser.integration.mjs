import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/** Called only with synthetic Auth/Firestore fixtures from the HTTP E2E. */
export async function verifyMailBrowser({revokeMembership}){
  const browser=await chromium.launch({headless:true,
    ...(process.env.CORMYR_TEST_CHROMIUM?{executablePath:process.env.CORMYR_TEST_CHROMIUM}:{}),
    args:['--no-sandbox'],
  });
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  const external=[],pageErrors=[];
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8789/'))external.push(r.url());});
  page.on('pageerror',error=>pageErrors.push(error.name));
  const login=async(name)=>{
    await page.getByLabel('E-mail',{exact:true}).fill(name+'@example.invalid');
    await page.getByLabel('Senha',{exact:true}).fill('Synthetic-only-Password-42!');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.locator('#workspace').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Atualizar',exact:true}).waitFor();
  };
  const logout=async()=>{
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.locator('#login-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#letters').textContent(),'');
    assert.equal(await page.locator('#thread').textContent(),'');
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  };
  try{
    await page.goto('http://127.0.0.1:8789/');
    await login('http-alice');
    assert.equal(await page.locator('#round-action').isVisible(),false);
    await page.getByRole('button',{name:/Synthetic HTTP/}).click();
    await page.getByText('Leitura registrada para sua conta.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Escrever missiva',exact:true}).click();
    await page.getByLabel('Destinatário',{exact:true}).selectOption('h:hb');
    await page.getByLabel('Data de Harptos',{exact:true}).fill('1522-01-30');
    await page.getByLabel('Assunto',{exact:true}).fill('Browser draft');
    await page.getByLabel('Mensagem',{exact:true}).fill('<img src=x onerror="window.mailXss=true"> Synthetic body');
    await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await page.getByText('Rascunho salvo.',{exact:true}).waitFor();
    await page.getByLabel('Assunto do rascunho',{exact:true}).fill('Browser delivered');
    await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await page.getByText('Rascunho atualizado.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Enviar rascunho',exact:true}).click();
    await page.getByText('Missiva entregue.',{exact:true}).waitFor();
    assert.equal(await page.locator('#thread img').count(),0);
    assert.equal(await page.evaluate(()=>window.mailXss),undefined);
    await logout();
    await login('http-bob');
    await page.getByRole('button',{name:/Browser delivered/}).click();
    await page.getByLabel('Data da resposta (Harptos)',{exact:true}).fill('1522-02-01');
    await page.getByLabel('Sua resposta',{exact:true}).fill('Browser reply');
    await page.getByRole('button',{name:'Enviar resposta',exact:true}).click();
    await page.getByText('Resposta programada para a próxima rodada.',{exact:true}).waitFor();
    await page.getByLabel('Buscar',{exact:true}).fill('absent synthetic term');
    await page.getByRole('button',{name:'Filtrar',exact:true}).click();
    await page.getByText('Nenhuma missiva nesta seleção.',{exact:true}).waitFor();
    await page.getByLabel('Buscar',{exact:true}).fill('');
    await logout();
    await login('http-gm');
    await page.getByRole('button',{name:'Encerrar rodada 1',exact:true}).click();
    await page.getByText('Rodada de teste atualizada.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Abrir rodada 2',exact:true}).click();
    await page.getByText('Rodada 2 aberta · Ambiente de teste',{exact:true}).waitFor();
    await logout();
    await login('http-alice');
    await page.getByRole('button',{name:/Browser delivered/}).click();
    await page.getByText('Browser reply',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.CORMYR_TEST_SCREENSHOT)await page.screenshot({path:process.env.CORMYR_TEST_SCREENSHOT,fullPage:true});
    await page.getByRole('button',{name:/Synthetic HTTP/}).click();
    await page.getByText('Private synthetic test only',{exact:true}).waitFor();
    await revokeMembership();
    await page.getByRole('button',{name:'Atualizar',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('new-letter').disabled);
    assert.equal(await page.getByText('Private synthetic test only',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:/Synthetic HTTP/}).count(),0);
    await logout();
    await page.getByLabel('E-mail',{exact:true}).fill('http-editor@example.invalid');
    await page.getByLabel('Senha',{exact:true}).fill('Synthetic-only-Password-42!');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByText('Acesso negado ou revogado. Entre novamente com uma conta autorizada.',{exact:true}).waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.deepEqual(external,[]);assert.deepEqual(pageErrors,[]);
    console.log('Browser mail E2E passed: login, privacy, draft, edit, delivery, reply, narrator rounds, XSS isolation, logout and mobile layout.');
  }catch(error){
    console.error('Synthetic browser check failed:',error.message);
    if(process.env.CORMYR_TEST_SCREENSHOT)await page.screenshot({path:process.env.CORMYR_TEST_SCREENSHOT,fullPage:true});
    throw error;
  }finally{await context.close();await browser.close();}
}
