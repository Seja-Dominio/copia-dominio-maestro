import { throwInjectedRenderError } from './injectRenderFailure.js';

export default function AdsBrain() {
  throwInjectedRenderError('AdsBrain');

  return <h1 data-testid="ads-brain-ready">Ads Brain operacional</h1>;
}
