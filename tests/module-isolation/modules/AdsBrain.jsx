export default function AdsBrain() {
  if (new URLSearchParams(window.location.search).get('crash') === 'AdsBrain') {
    throw new Error('Falha de renderização injetada em Ads Brain');
  }

  return <h1 data-testid="ads-brain-ready">Ads Brain operacional</h1>;
}
