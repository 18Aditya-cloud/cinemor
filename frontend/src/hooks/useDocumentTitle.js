import { useEffect } from 'react';
import { SITE } from '../config/site.js';

// Sets the browser tab title, for example "Log in | Cinemor AI".
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE.name}` : `${SITE.name} | Turn a prompt into a story`;
  }, [title]);
}
