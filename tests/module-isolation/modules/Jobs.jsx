export default function Jobs() {
  if (new URLSearchParams(window.location.search).get('crash') === 'Jobs') {
    throw new Error('Falha de renderização injetada em Jobs');
  }

  return <h1 data-testid="jobs-ready">Jobs operacional</h1>;
}
