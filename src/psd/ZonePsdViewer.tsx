import type { ReactNode } from 'react'
import { Viewer, type ViewerProps } from '../viewer/Viewer'
import { useZones } from '../zones/useZones'
import { ZoneToolbar } from '../zones/ZoneToolbar'
import type { DataSource } from './dataSource'
import { PsdPanel } from './PsdPanel'

type Props = Pick<ViewerProps, 'recording' | 'fileName' | 'onOpen' | 'theme' | 'onToggleTheme'> & {
  source: DataSource
  filtersUi: ReactNode
}

/** Viewer + filters + zones + PSD panel wiring. */
export function ZonePsdViewer({ source, filtersUi, ...props }: Props) {
  const zs = useZones(props.recording.duration)
  const { channels } = props.recording
  return (
    <Viewer
      {...props}
      getData={(i) => source.getData(i) ?? channels[i].data}
      eegOverlay={zs.eegOverlay}
      minimapOverlay={zs.minimapOverlay}
      overlayKey={`${source.version}:${zs.overlayKey}`}
      toolbarExtra={
        <>
          {filtersUi}
          <ZoneToolbar zs={zs} />
        </>
      }
      bottomPanel={(channelNames) => (
        <PsdPanel
          recording={props.recording}
          zones={zs.zones}
          source={source}
          theme={props.theme}
          channelNames={channelNames}
        />
      )}
    />
  )
}
