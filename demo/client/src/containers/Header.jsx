import React from 'react';
import Logo from '../images/quell_logos/QUELL-long.svg';

// function smoothScroll(element) {
//   document.getElementById(element).scrollIntoView({ behavior: 'smooth' });
// }

const Header = () => {
  return (
    <header>
      <div id='logo-main-container'>
        <img id='logo_main' src={Logo} width={600} style={{margin:'20px'}}></img>
      </div>

      <ul className='header-links'>
        <li>
          <a href="https://www.npmjs.com/package/@quell/client" target='_blank'>CLIENT</a>
        </li>
        <li>
          <a href="https://www.npmjs.com/package/@quell/server" target='_blank'>SERVER</a>
        </li>
        <li>
          <a href="https://chrome.google.com/webstore/detail/quell-developer-tool/jnegkegcgpgfomoolnjjkmkippoellod" target='_blank'>DEVTOOL</a>
        </li>
        <li>
          <a href='#demo'>DEMO</a>
        </li>
        <li>
          <a href='#team-quell'>TEAM</a>
        </li>
        <li>
          <a href='https://github.com/open-source-labs/Quell' target='_blank'>
            GITHUB
          </a>
        </li>
      </ul>
    </header>
  );
};

export default Header;
