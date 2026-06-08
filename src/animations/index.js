import WindowFunctions  from './WindowFunctions'
import DriverExecutors  from './DriverExecutors'
import Shuffle          from './Shuffle'
import ClusterManagers  from './ClusterManagers'
import StagesTasks      from './StagesTasks'
import DAGScheduler     from './DAGScheduler'

export const animations = {
  'window-functions':  WindowFunctions,
  'driver-executors':  DriverExecutors,
  'shuffle':           Shuffle,
  'cluster-managers':  ClusterManagers,
  'stages-tasks':      StagesTasks,
  'dag-scheduler':     DAGScheduler,
}
