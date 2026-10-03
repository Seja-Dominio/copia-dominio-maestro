import { throwInjectedRenderError } from './injectRenderFailure.js';

export default function Dashboard() {
  throwInjectedRenderError('Dashboard');
  return <h1 data-testid="dashboard-ready">Dashboard operacional</h1>;
}
