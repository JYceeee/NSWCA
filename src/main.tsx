import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DialogProvider } from './components/Dialogs'
import { AppShell } from './layout/AppShell'
import { BrandStoreProvider } from './store/BrandStore'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandStoreProvider>
      <DialogProvider>
        <AppShell />
      </DialogProvider>
    </BrandStoreProvider>
  </StrictMode>,
)
