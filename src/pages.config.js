import __Layout from './Layout.jsx';

import Agenda from './pages/Agenda';
import ClientPortfolio from './pages/ClientPortfolio';
import Conversations from './pages/Conversations';
import Financial from './pages/Financial';
import Jobs from './pages/Jobs';
import Media from './pages/Media';
import Production from './pages/Production';
import Projects from './pages/Projects';
import Proposals from './pages/Proposals';
import Records from './pages/Records';
import Reports from './pages/Reports';
import Templates from './pages/Templates';
import AdsBrain from './pages/AdsBrain';

export const PAGES = {
    "Agenda": Agenda,
    "ClientPortfolio": ClientPortfolio,
    "Conversations": Conversations,
    "Financial": Financial,
    "Jobs": Jobs,
    "Media": Media,
    "Production": Production,
    "Projects": Projects,
    "Proposals": Proposals,
    "Records": Records,
    "Reports": Reports,
    "Templates": Templates,
    "AdsBrain": AdsBrain,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
