package com.commit.project2.service;

import com.commit.project2.mapper.GasMapper;
import com.commit.project2.mapper.RegionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RegionService {
  private final GasMapper gasMapper;
  private final RegionMapper regionMapper;

}
