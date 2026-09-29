import { Viewer, type ViewerProps } from '../viewer/Viewer'
import { useZones } from '../zones/useZones'
import { ZoneToolbar } from '../zones/ZoneToolbar'
import { useDataSource } from './dataSource'
import { PsdPanel } from './PsdPanel'

type Props = Pick<ViewerProps, 'recording' | 'fileName' | 'onOpen' | 'theme' | 'onToggleTheme'>

/**
 * Viewer + zones + PSD panel wiring. Replace the filter toolbar/extras here when
 * the filter UI lands (Viewer `toolbarExtra` can hold both groups).
 */
export function ZonePsdViewer(props: Props) {
  const source = useDataSource(props.recording)
  const zs = useZones(props.recording.duration)
  return (
    <Viewer
      {...props}
      getData={source.getData}
      eegOverlay={zs.eegOverlay}
      minimapOverlay={zs.minimapOverlay}
      overlayKey={zs.overlayKey}
      toolbarExtra={<ZoneToolbar zs={zs} />}
      bottomPanel={<PsdPanel recording={props.recording} zones={zs.zones} source={source} theme={props.theme} />}
    />
  )
}
