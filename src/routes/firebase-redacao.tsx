import {createFileRoute,Navigate} from '@tanstack/react-router';

/**
 * Compatibility link: the independent, reduced Firebase editorial panel is
 * retired. The authenticated Atlas workspace already renders the complete
 * Editor-Chefe interface with its original tabs, filters and saved editions.
 * /firebase-access checks the role and applies all server authorization.
 */
export const Route=createFileRoute('/firebase-redacao')({
 component:()=> <Navigate to="/firebase-access" replace/>,
 head:()=>({meta:[{title:'A Folha Sem Selo · Redação Oficial'}]}),
});
