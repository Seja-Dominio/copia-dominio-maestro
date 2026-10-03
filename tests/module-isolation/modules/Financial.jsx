import { throwInjectedRenderError } from './injectRenderFailure.js';

export default function Financial() {
  throwInjectedRenderError('Financial');
  return <h1 data-testid="financial-ready">Financeiro operacional</h1>;
}
