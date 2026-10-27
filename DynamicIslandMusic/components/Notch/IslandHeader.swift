//
//  IslandHeader.swift
//  DynamicIslandMusic
//
//  Created by Harsh Vardhan  Goswami  on 04/08/24.
//

import Defaults
import SwiftUI

struct IslandHeader: View {
    /// The header row sits this far below the top edge of the screen; the black notch shape is pulled back up so it starts at the very top.
    static let topInset: CGFloat = 6

    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject var batteryModel = BatteryStatusViewModel.shared
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    @StateObject var tvm = ShelfStateViewModel.shared
    @ObservedObject var layout = LayoutManager.shared

    /// A narrow island (only a few small components) draws the tabs smaller so all six and the buttons fit around the notch.
    private var compact: Bool {
        layout.openSize(for: vm.screenUUID, view: coordinator.currentView).width < LayoutManager.fullHeaderWidth
    }

    var body: some View {
        HStack(spacing: 0) {
            HStack {
                if (!tvm.isEmpty || coordinator.alwaysShowTabs) && Defaults[.islandShelf] {
                    TabSelectionView(dense: compact)
                } else if vm.notchState == .open {
                    EmptyView()
                }
            }
            .padding(.leading, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(vm.notchState == .closed ? 0 : 1)
            .blur(radius: vm.notchState == .closed ? 20 : 0)
            .zIndex(2)

            if vm.notchState == .open {
                Rectangle()
                    .fill(NSScreen.screen(withUUID: coordinator.selectedScreenUUID)?.safeAreaInsets.top ?? 0 > 0 ? .black : .clear)
                    // Exactly the size and place of the camera housing: from the top edge down, as wide as the housing.
                    .frame(width: vm.notchHousingWidth, height: max(24, vm.effectiveClosedNotchHeight))
                    .mask {
                        NotchShape()
                    }
                    .offset(y: -Self.topInset)
            }

            HStack(spacing: 4) {
                if vm.notchState == .open {
                    if Defaults[.settingsIconInNotch] {
                        GlowQuickButton()
                        GlassCircleButton(symbol: layout.editing ? "checkmark" : "pencil", size: 25) {
                            withAnimation(.smooth) {
                                if !layout.editing { IslandViewCoordinator.shared.currentView = .home }
                                layout.editing.toggle()
                            }
                        }
                        .help(layout.editing ? "Listo" : "Editar componentes")
                        GlassCircleButton(symbol: "gearshape", size: 25) {
                            SettingsWindowController.shared.showWindow()
                        }
                        .help("Ajustes")
                    }
                    if Defaults[.showBatteryIndicator] {
                        IslandBatteryView(
                            batteryWidth: 30,
                            isCharging: batteryModel.isCharging,
                            isInLowPowerMode: batteryModel.isInLowPowerMode,
                            isPluggedIn: batteryModel.isPluggedIn,
                            levelBattery: batteryModel.levelBattery,
                            maxCapacity: batteryModel.maxCapacity,
                            timeToFullCharge: batteryModel.timeToFullCharge,
                            isForNotification: false
                        )
                    }
                }
            }
            .font(.system(.headline, design: .rounded))
            .padding(.trailing, 14)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .opacity(vm.notchState == .closed ? 0 : 1)
            .blur(radius: vm.notchState == .closed ? 20 : 0)
            .zIndex(2)
        }
        .foregroundColor(.gray)
        .environmentObject(vm)
    }
}

#Preview {
    IslandHeader().environmentObject(IslandViewModel())
}
