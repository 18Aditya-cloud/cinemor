import useDocumentTitle from '../hooks/useDocumentTitle.js';
import Footer from '../components/Footer.jsx';
import Hero from '../sections/Hero.jsx';
import ShowcaseCard from '../sections/ShowcaseCard.jsx';
import StoryCarousel from '../sections/StoryCarousel.jsx';
import LogoStage from '../sections/LogoStage.jsx';
import PromptFlame from '../sections/PromptFlame.jsx';
import Faq from '../sections/Faq.jsx';

/**
 * The home page (/). Order, top to bottom:
 *   Hero -> big video card -> story carousel -> particle logo in a hand -> flame + PROMPT/CREATE/COLLAB -> FAQ
 * <LogoStage /> is the scroll section that controls when the particles form the logo.
 */
export default function HomePage({ stageRef, onCreate }) {
  useDocumentTitle('');
  return (
    <>
      <Hero onCreate={onCreate} />
      <ShowcaseCard />
      <StoryCarousel onTry={onCreate} />
      <LogoStage ref={stageRef} />
      <PromptFlame />
      <Faq />
      <Footer />
    </>
  );
}
