import {createRoot} from 'react-dom/client';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import '@/styles.css';

function Harness(){
 return <div className="battle-module" style={{padding:16,maxWidth:1100,margin:'0 auto'}}>
  <BattleGotGame onBack={()=>{window.location.hash='back';}}/>
 </div>;
}

createRoot(document.getElementById('root')!).render(<Harness/>);
