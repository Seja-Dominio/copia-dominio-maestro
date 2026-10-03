import { throwInjectedRenderError } from './injectRenderFailure.js';

export default function Jobs() {
  throwInjectedRenderError('Jobs');

  return <h1 data-testid="jobs-ready">Jobs operacional</h1>;
}
