import React from 'react';

// This polyfill ensures that even if some modules (especially old or improperly compiled ones)
// expect a global React object, the application won't crash with "ReferenceError: React is not defined".
if (typeof window !== 'undefined') {
  (window as any).React = React;
  (window as any).global = window;
}

console.log('POLYFILL: Global React defined successfully.');
