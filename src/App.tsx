import { KalshiTabbedDashboard } from './components/KalshiTabbedDashboard'
import { KalshiTradingRootProvider } from './context/TradingEngineProvider'

function App() {
  return (
    <KalshiTradingRootProvider>
      <KalshiTabbedDashboard />
    </KalshiTradingRootProvider>
  )
}

export default App
